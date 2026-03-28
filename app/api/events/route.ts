import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start           = searchParams.get('start')           ?? undefined
  const end             = searchParams.get('end')             ?? undefined
  const created_by      = searchParams.get('created_by')      ?? undefined
  const team_only       = searchParams.get('team_only')       === 'true'
  const include_company = searchParams.get('include_company') !== 'false' // default true

  let query = supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color)`)
    .order('start_at')

  if (start) query = query.gte('start_at', start)
  if (end)   query = query.lte('start_at', end)

  if (created_by) {
    // 특정 멤버 일정
    if (include_company) {
      // 해당 멤버 일정 + 전사 공개 일정
      query = query.or(`created_by.eq.${created_by},visibility.eq.company`)
    } else {
      query = query.eq('created_by', created_by)
    }
  } else if (team_only) {
    // 팀 일정
    if (include_company) {
      // 팀 일정 + 전사 공개 일정
      query = query.in('visibility', ['team', 'company'])
    } else {
      query = query.eq('visibility', 'team')
    }
  } else if (!include_company) {
    // 전체 보기지만 전사 일정 제외
    query = query.neq('visibility', 'company')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data: profile } = await supabase.from('cg_profiles').select('team_id').eq('id', user.id).single()

  const { data, error } = await supabase.from('cg_events').insert({
    ...body,
    created_by: user.id,
    team_id: body.visibility === 'team' ? profile?.team_id : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
