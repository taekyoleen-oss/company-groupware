import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countWorkdays } from '@/lib/utils/holidayDates'

function toKSTDate(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 3600000).toISOString().slice(0, 10)
}

function calcDays(startAt: string, endAt: string, isAllDay: boolean): number {
  if (!isAllDay) return 0.5
  return countWorkdays(toKSTDate(startAt), toKSTDate(endAt))
}

// GET: 본인이 결재자인 직원들의 휴가 현황 + 대기 취소요청 + 대기 신청건
//   - 일반 결재자(manager): 본인이 결재자로 지정된 직원만
//   - 사장님 팀(team.name='사장님') 소속 사용자: 전체 활성 직원
//   - 앱관리자(super_admin): 전체 활성 직원
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentYear = new Date().getFullYear()

  // 호출자 프로필 + 팀명 조회 (사장님 팀 / super_admin 여부 판정용)
  const { data: meProfile } = await supabase
    .from('cg_profiles')
    .select('id, is_super_admin, team:cg_teams(name)')
    .eq('id', user.id)
    .single()

  const isSuper = (meProfile as any)?.is_super_admin === true
  const isPresidentTeam = ((meProfile as any)?.team?.name ?? '') === '사장님'
  const seesAllEmployees = isSuper || isPresidentTeam

  // employees 쿼리: 사장님 팀/super 면 전 직원, 그 외엔 본인 결재자인 직원
  let empQuery = supabase
    .from('cg_profiles')
    .select('id, full_name, color, team_id, role, status')
    .neq('status', 'pending')
    .neq('id', user.id) // 본인 제외
    .order('full_name')

  if (!seesAllEmployees) {
    empQuery = empQuery.eq('approver_id', user.id)
  }

  const { data: employees, error: empErr } = await empQuery

  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

  const employeeIds = (employees ?? []).map(e => e.id)

  // 결재 가능한 요청의 범위 — 본인이 결재자(approver_id=me)로 지정된 직원들
  // 사장님/super 도 본인이 직접 결재자인 직원만 결재 가능. 전직원은 "표시"만.
  const { data: myDirectReports } = await supabase
    .from('cg_profiles')
    .select('id')
    .eq('approver_id', user.id)
  const approvalScopeIds = (myDirectReports ?? []).map(r => r.id)

  if (employeeIds.length === 0) {
    return NextResponse.json({
      employees: [], cancel_requests: [], vacation_requests: [],
      viewer: {
        is_super_admin: isSuper,
        is_president_team: isPresidentTeam,
        sees_all_employees: seesAllEmployees,
      },
    })
  }

  // Supabase 의 .in() 은 빈 배열을 허용하지 않으므로 비어있을 땐 sentinel id 사용
  const SAFE_EMPTY = ['00000000-0000-0000-0000-000000000000']
  const approvalScopeFilter = approvalScopeIds.length > 0 ? approvalScopeIds : SAFE_EMPTY

  const [allocsRes, eventsRes, pendingsRes, cancelReqsRes, vacReqsRes] = await Promise.all([
    supabase
      .from('cg_vacation_allocations')
      .select('user_id, total_days')
      .in('user_id', employeeIds)
      .eq('year', currentYear),
    supabase
      .from('cg_events')
      .select('created_by, start_at, end_at, is_all_day')
      .in('created_by', employeeIds)
      .eq('is_vacation', true)
      .gte('start_at', `${currentYear - 1}-12-22T00:00:00.000Z`)
      .lte('start_at', `${currentYear}-12-31T23:59:59.999Z`),
    supabase
      .from('cg_vacation_requests')
      .select('requested_by, start_at, end_at, is_all_day')
      .in('requested_by', employeeIds)
      .eq('status', 'pending')
      .gte('start_at', `${currentYear - 1}-12-22T00:00:00.000Z`)
      .lte('start_at', `${currentYear}-12-31T23:59:59.999Z`),
    // 취소 신청: 본인이 결재할 수 있는 직원의 건만 표시
    supabase
      .from('cg_vacation_cancel_requests')
      .select(`
        *,
        requester:cg_profiles!requested_by(id, full_name, color),
        reviewer:cg_profiles!reviewed_by(id, full_name, color),
        event:cg_events(id, title, start_at, end_at, is_all_day)
      `)
      .in('requested_by', approvalScopeFilter)
      .order('created_at', { ascending: false }),
    // 휴가 신청: approver_id 가 본인인 것만
    supabase
      .from('cg_vacation_requests')
      .select(`
        *,
        requester:cg_profiles!requested_by(id, full_name, color),
        reviewer:cg_profiles!reviewed_by(id, full_name, color)
      `)
      .eq('approver_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const allocMap: Record<string, number> = {}
  for (const a of allocsRes.data ?? []) allocMap[a.user_id] = a.total_days

  const usedMap: Record<string, number> = {}
  for (const e of eventsRes.data ?? []) {
    const kstYear = parseInt(toKSTDate(e.start_at).slice(0, 4))
    if (kstYear !== currentYear) continue
    usedMap[e.created_by] = (usedMap[e.created_by] ?? 0) + calcDays(e.start_at, e.end_at, e.is_all_day ?? true)
  }

  const pendingMap: Record<string, number> = {}
  for (const p of pendingsRes.data ?? []) {
    const kstYear = parseInt(toKSTDate(p.start_at).slice(0, 4))
    if (kstYear !== currentYear) continue
    pendingMap[p.requested_by] = (pendingMap[p.requested_by] ?? 0) + calcDays(p.start_at, p.end_at, p.is_all_day ?? true)
  }

  const employeeSummaries = (employees ?? []).map(e => {
    const total = allocMap[e.id] ?? 10
    const used = usedMap[e.id] ?? 0
    const pending = pendingMap[e.id] ?? 0
    return {
      id: e.id,
      full_name: e.full_name,
      color: e.color,
      team_id: e.team_id,
      role: e.role,
      status: e.status,
      total_days: total,
      used_days: used,
      pending_days: pending,
      remaining_days: total - used - pending,
    }
  })

  return NextResponse.json({
    employees: employeeSummaries,
    cancel_requests: cancelReqsRes.data ?? [],
    vacation_requests: vacReqsRes.data ?? [],
    // 호출자 컨텍스트 — UI 분기에 사용 (예: 사장님 팀이면 처리 이력 숨김)
    viewer: {
      is_super_admin: isSuper,
      is_president_team: isPresidentTeam,
      sees_all_employees: seesAllEmployees,
    },
  })
}
