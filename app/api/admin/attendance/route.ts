import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!isSuperAdmin(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const [usersRes, attendanceRes] = await Promise.all([
    supabase
      .from('cg_profiles')
      .select('id, full_name, color, team_id, role, status')
      .eq('status', 'active')
      .order('full_name'),
    // method 컬럼이 아직 없는 환경 호환 — * 와일드카드
    supabase
      .from('cg_attendance')
      .select('*')
      .eq('date', date),
  ])

  if (attendanceRes.error) {
    console.error('[admin/attendance GET] attendance select error:', attendanceRes.error.message)
  }

  const attendanceMap: Record<string, { checked_in_at: string; checked_out_at: string | null; method: string }> = {}
  for (const a of (attendanceRes.data ?? []) as Array<{ user_id: string; checked_in_at: string; checked_out_at?: string | null; method?: string | null }>) {
    attendanceMap[a.user_id] = {
      checked_in_at: a.checked_in_at,
      checked_out_at: a.checked_out_at ?? null,
      method: a.method ?? 'office_login',
    }
  }

  const result = (usersRes.data ?? []).map(u => ({
    id: u.id,
    full_name: u.full_name,
    color: u.color,
    team_id: u.team_id,
    role: u.role,
    checked_in_at: attendanceMap[u.id]?.checked_in_at ?? null,
    checked_out_at: attendanceMap[u.id]?.checked_out_at ?? null,
    method: attendanceMap[u.id]?.method ?? null,
  }))

  return NextResponse.json({ date, records: result })
}
