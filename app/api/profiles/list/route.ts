import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** 전사 모든 활성 사용자 + 팀 목록 반환 (메시지 수신자 선택용) */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: profiles }, { data: teams }] = await Promise.all([
    supabase
      .from('cg_profiles')
      .select('id, full_name, color, role, team_id')
      .eq('status', 'active')
      .neq('id', user.id)   // 자기 자신 제외
      .order('full_name'),
    supabase
      .from('cg_teams')
      .select('id, name')
      .order('name'),
  ])

  return NextResponse.json({ profiles: profiles ?? [], teams: teams ?? [] })
}
