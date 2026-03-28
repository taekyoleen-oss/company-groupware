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
  const { notify, ...eventBody } = body

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('team_id, full_name')
    .eq('id', user.id)
    .single()

  const { data, error } = await supabase.from('cg_events').insert({
    ...eventBody,
    created_by: user.id,
    team_id: eventBody.visibility === 'team' ? (profile as any)?.team_id : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 알림 발송 ────────────────────────────────────────────
  if (notify && data) {
    const event      = data as any
    const senderName = (profile as any)?.full_name ?? '알 수 없음'
    const startStr   = new Date(event.start_at).toLocaleString('ko-KR', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const content = `[일정 알림] ${event.title}\n📅 ${startStr}\n작성자: ${senderName}`

    if (event.visibility === 'team' && (profile as any)?.team_id) {
      // 팀 전체에게 메시지 1건
      await (supabase as any).from('cg_messages').insert({
        sender_id:   user.id,
        sender_name: senderName,
        team_id:     (profile as any).team_id,
        content,
      })
    } else if (event.visibility === 'company') {
      // 전사 활성 사용자 전원에게 개별 메시지
      const { data: allProfiles } = await supabase
        .from('cg_profiles')
        .select('id, full_name')
        .eq('status', 'active')
        .neq('id', user.id)

      if (allProfiles && allProfiles.length > 0) {
        await (supabase as any).from('cg_messages').insert(
          allProfiles.map((p: any) => ({
            sender_id:      user.id,
            sender_name:    senderName,
            recipient_id:   p.id,
            recipient_name: p.full_name,
            content,
          }))
        )
      }
    }
  }

  return NextResponse.json(data, { status: 201 })
}
