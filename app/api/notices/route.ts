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

  if (cursor) {
    // 2페이지 이후: 고정 공지(최대 3개)는 1페이지에 모두 표시되므로 제외해야
    // created_at 커서 페이지네이션에서 오래된 고정 공지가 다음 페이지에 중복 표시되지 않는다.
    query = query.eq('is_pinned', false).lt('created_at', cursor)
  } else {
    query = query.order('is_pinned', { ascending: false })
  }
  query = query.order('created_at', { ascending: false }).limit(limit + 1)

  if (search) query = query.ilike('title', `%${search}%`)

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
    // 전사는 전체 3개, 팀은 팀별 3개 — visibility='team' 이면 팀 범위로 카운트
    let pinCount = supabase
      .from('cg_notices')
      .select('id', { count: 'exact', head: true })
      .eq('is_pinned', true)
      .eq('visibility', body.visibility)
    if (body.visibility === 'team' && profile?.team_id) {
      pinCount = pinCount.eq('team_id', profile.team_id)
    }
    const { count } = await pinCount
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
