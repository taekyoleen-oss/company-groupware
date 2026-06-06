import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('team_id, team:cg_teams(id, name)')
    .eq('id', user.id)
    .single()

  if (!profile?.team_id) {
    return NextResponse.json({ team: null, members: [] })
  }

  const { data: members } = await supabase
    .from('cg_profiles')
    .select('id, full_name, color, role')
    .eq('team_id', profile.team_id)
    .eq('status', 'active')
    .neq('id', user.id)
    .neq('is_hidden', true)   // 개발자 전용 숨김 계정 제외
    .order('full_name')

  return NextResponse.json({
    team: (profile as any).team,
    members: members ?? [],
  })
}
