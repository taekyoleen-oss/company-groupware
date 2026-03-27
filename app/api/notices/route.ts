import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tab = (searchParams.get('tab') as 'company' | 'team') ?? 'company'
  const search = searchParams.get('search') ?? ''
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = 20

  let query = supabase
    .from('cg_notices')
    .select(`*, author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name), attachments:cg_notice_attachments(*)`)
    .eq('visibility', tab)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (search) query = query.ilike('title', `%${search}%`)
  if (cursor) query = query.lt('created_at', cursor)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hasMore = data.length > limit
  return NextResponse.json({ items: hasMore ? data.slice(0, limit) : data, hasMore })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data: profile } = await supabase.from('cg_profiles').select('team_id, role').eq('id', user.id).single()

  if (body.is_pinned) {
    if (!['manager', 'admin'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: '핀 고정 권한 없음' }, { status: 403 })
    }
    const { count } = await supabase
      .from('cg_notices')
      .select('id', { count: 'exact', head: true })
      .eq('is_pinned', true)
      .eq('visibility', body.visibility)
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: '핀 고정은 최대 3개까지 가능합니다.' }, { status: 400 })
    }
  }

  const { data, error } = await supabase.from('cg_notices').insert({
    ...body,
    created_by: user.id,
    team_id: body.visibility === 'team' ? profile?.team_id : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
