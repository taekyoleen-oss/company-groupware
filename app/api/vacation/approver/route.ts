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
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentYear = new Date().getFullYear()

  const { data: employees, error: empErr } = await supabase
    .from('cg_profiles')
    .select('id, full_name, color, team_id, role, status')
    .eq('approver_id', user.id)
    .neq('status', 'pending')
    .order('full_name')

  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

  const employeeIds = (employees ?? []).map(e => e.id)

  if (employeeIds.length === 0) {
    return NextResponse.json({ employees: [], cancel_requests: [], vacation_requests: [] })
  }

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
    supabase
      .from('cg_vacation_cancel_requests')
      .select(`
        *,
        requester:cg_profiles!requested_by(id, full_name, color),
        reviewer:cg_profiles!reviewed_by(id, full_name, color),
        event:cg_events(id, title, start_at, end_at, is_all_day)
      `)
      .in('requested_by', employeeIds)
      .order('created_at', { ascending: false }),
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
  })
}
