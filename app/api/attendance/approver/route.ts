import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

// GET ?date=YYYY-MM-DD
//   - 본인이 결재자(approver_id == me)로 지정된 직원들의 해당 날짜 출근/퇴근 조회
//   - 사장님 팀 / 앱관리자(super_admin)는 전체 활성 직원
//   - /api/vacation/approver 와 동일한 가시 범위 규칙을 따른다.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? kstToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { data: meProfile } = await supabase
    .from('cg_profiles')
    .select('id, is_super_admin, team:cg_teams(name)')
    .eq('id', user.id)
    .single()

  const isSuper = (meProfile as any)?.is_super_admin === true
  const isPresidentTeam = ((meProfile as any)?.team?.name ?? '') === '사장님'
  const seesAllEmployees = isSuper || isPresidentTeam

  let empQuery = supabase
    .from('cg_profiles')
    .select('id, full_name, color, team_id, role, is_super_admin, team:cg_teams(name)')
    .eq('status', 'active')
    .neq('id', user.id)
    .order('full_name')
  if (!seesAllEmployees) {
    empQuery = empQuery.eq('approver_id', user.id)
  }

  const { data: employeesRaw, error: empErr } = await empQuery
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

  // 앱관리자(super_admin)는 출근 관리 대상에서 제외
  const employees = (employeesRaw ?? []).filter((e: any) => !isSuperAdmin(e))
  const ids = employees.map((e: any) => e.id)
  if (ids.length === 0) {
    return NextResponse.json({ date, records: [] })
  }

  const { data: attendanceRows, error: attErr } = await supabase
    .from('cg_attendance')
    .select('*')
    .eq('date', date)
    .in('user_id', ids)
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 })

  const map: Record<string, { checked_in_at: string; checked_out_at: string | null; method: string }> = {}
  for (const a of (attendanceRows ?? []) as any[]) {
    map[a.user_id] = {
      checked_in_at: a.checked_in_at,
      checked_out_at: a.checked_out_at ?? null,
      method: a.method ?? 'office_login',
    }
  }

  const records = employees.map((e: any) => ({
    id: e.id,
    full_name: e.full_name,
    color: e.color,
    team_name: e.team?.name ?? null,
    checked_in_at: map[e.id]?.checked_in_at ?? null,
    checked_out_at: map[e.id]?.checked_out_at ?? null,
    method: map[e.id]?.method ?? null,
  }))

  return NextResponse.json({ date, records })
}
