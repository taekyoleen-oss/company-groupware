import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

async function checkAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', userId).single()
  return isSuperAdmin(data)
}

export async function GET() {
  const supabase = await createClient()
  // sort_order 우선, 동률이면 이름 가나다순
  const { data, error } = await supabase
    .from('cg_teams')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name } = await request.json()
  // 신규 팀은 가장 마지막 자리로 (현재 최대 + 10)
  const { data: last } = await supabase
    .from('cg_teams')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((last?.sort_order ?? 0) + 10)
  const { data, error } = await supabase
    .from('cg_teams')
    .insert({ name, sort_order: nextOrder })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
