import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// GET: 출근(체크인) 이력 — 관리자 전용
//   - 옵션: ?from=YYYY-MM-DD&to=YYYY-MM-DD  (없으면 전체)
//   - 가장 최근부터 정렬 (date desc, checked_in_at desc)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  if (!isSuperAdmin(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // method 컬럼 부재 환경 호환
  let query = supabase
    .from('cg_attendance')
    .select(`
      *,
      profile:cg_profiles!user_id(id, full_name, color, role, team_id, team:cg_teams(id, name))
    `)
    .order('date', { ascending: false })
    .order('checked_in_at', { ascending: false })
    .limit(2000)

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string
    user_id: string
    date: string
    checked_in_at: string
    checked_out_at: string | null
    method: string | null
    profile: {
      full_name: string
      color: string
      team: { id: string; name: string } | null
    } | null
  }

  const items = ((data ?? []) as unknown as Row[]).map(row => ({
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    checked_in_at: row.checked_in_at,
    checked_out_at: row.checked_out_at ?? null,
    method: (row.method ?? 'office_login') as 'gps' | 'office_login',
    full_name: row.profile?.full_name ?? '(알 수 없음)',
    color: row.profile?.color ?? '#6B7280',
    team_name: row.profile?.team?.name ?? null,
  }))

  return NextResponse.json(items)
}
