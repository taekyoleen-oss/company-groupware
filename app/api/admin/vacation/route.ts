import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function toKSTDate(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 3600000).toISOString().slice(0, 10)
}

function calcDays(startAt: string, endAt: string, isAllDay: boolean): number {
  if (!isAllDay) return 0.5
  const s = new Date(toKSTDate(startAt))
  const e = new Date(toKSTDate(endAt))
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const currentYear = new Date().getFullYear()

  const [usersRes, allocRes, eventsRes] = await Promise.all([
    supabase
      .from('cg_profiles')
      .select('id, full_name, color, team_id, role, status, approver_id')
      .neq('status', 'pending')
      .order('full_name'),
    supabase
      .from('cg_vacation_allocations')
      .select('user_id, total_days')
      .eq('year', currentYear),
    supabase
      .from('cg_events')
      .select('created_by, start_at, end_at, is_all_day')
      .eq('is_vacation', true)
      .gte('start_at', `${currentYear - 1}-12-22T00:00:00.000Z`)
      .lte('start_at', `${currentYear}-12-31T23:59:59.999Z`),
  ])

  const allocMap: Record<string, number> = {}
  for (const a of allocRes.data ?? []) {
    allocMap[a.user_id] = a.total_days
  }

  const usedMap: Record<string, number> = {}
  for (const e of eventsRes.data ?? []) {
    const kstYear = parseInt(toKSTDate(e.start_at).slice(0, 4))
    if (kstYear !== currentYear) continue
    usedMap[e.created_by] = (usedMap[e.created_by] ?? 0) + calcDays(e.start_at, e.end_at, e.is_all_day ?? true)
  }

  // 결재자 이름 매핑 (전체 user 데이터에서 lookup)
  const nameMap: Record<string, string> = {}
  for (const u of usersRes.data ?? []) {
    nameMap[u.id] = u.full_name
  }

  const result = (usersRes.data ?? []).map(u => ({
    id: u.id,
    full_name: u.full_name,
    color: u.color,
    team_id: u.team_id,
    role: u.role,
    status: u.status,
    approver_id: u.approver_id,
    approver_name: u.approver_id ? (nameMap[u.approver_id] ?? null) : null,
    total_days: allocMap[u.id] ?? 10,
    used_days: usedMap[u.id] ?? 0,
    remaining_days: (allocMap[u.id] ?? 10) - (usedMap[u.id] ?? 0),
  }))

  return NextResponse.json(result)
}
