import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type ProfilePatch = Pick<
  Database['public']['Tables']['cg_profiles']['Update'],
  'full_name' | 'color' | 'team_id'
>

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('cg_profiles').select(`*, team:cg_teams(id,name)`).eq('id', user.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json()) as Record<string, unknown>
  const patch: ProfilePatch = {}
  if (typeof body.full_name === 'string') patch.full_name = body.full_name
  if (typeof body.color === 'string') patch.color = body.color
  if (body.team_id === null) patch.team_id = null
  else if (typeof body.team_id === 'string') patch.team_id = body.team_id
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'full_name, color 또는 team_id가 필요합니다.' }, { status: 400 })
  }
  const { data, error } = await supabase.from('cg_profiles').update(patch).eq('id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
