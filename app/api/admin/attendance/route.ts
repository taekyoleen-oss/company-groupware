import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const [usersRes, attendanceRes] = await Promise.all([
    supabase
      .from('cg_profiles')
      .select('id, full_name, color, team_id, role, status')
      .eq('status', 'active')
      .order('full_name'),
    supabase
      .from('cg_attendance')
      .select('user_id, checked_in_at')
      .eq('date', date),
  ])

  const attendanceMap: Record<string, string> = {}
  for (const a of attendanceRes.data ?? []) {
    attendanceMap[a.user_id] = a.checked_in_at
  }

  const result = (usersRes.data ?? []).map(u => ({
    id: u.id,
    full_name: u.full_name,
    color: u.color,
    team_id: u.team_id,
    role: u.role,
    checked_in_at: attendanceMap[u.id] ?? null,
  }))

  return NextResponse.json({ date, records: result })
}
