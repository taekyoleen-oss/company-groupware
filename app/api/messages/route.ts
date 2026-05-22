import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 본인이 숨긴 메시지 ID 목록
async function fetchHiddenIds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<Set<string>> {
  const { data } = await (supabase as any)
    .from('cg_message_hides')
    .select('message_id')
    .eq('user_id', userId)
  return new Set(((data ?? []) as { message_id: string }[]).map(h => h.message_id))
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'sent' | 'received' (default)

  const hidden = await fetchHiddenIds(supabase, user.id)

  if (type === 'sent') {
    const { data, error } = await (supabase as any)
      .from('cg_messages')
      .select('*')
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const filtered = ((data ?? []) as { id: string }[]).filter(m => !hidden.has(m.id))
    return NextResponse.json(filtered)
  }

  // received (default)
  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('team_id')
    .eq('id', user.id)
    .single()

  const orFilter = profile?.team_id
    ? `recipient_id.eq.${user.id},team_id.eq.${profile.team_id}`
    : `recipient_id.eq.${user.id}`

  const { data, error } = await (supabase as any)
    .from('cg_messages')
    .select('*')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const filtered = ((data ?? []) as { id: string }[]).filter(m => !hidden.has(m.id))
  return NextResponse.json(filtered)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: senderProfile } = await supabase
    .from('cg_profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const body = await request.json()
  if (!body.content?.trim()) {
    return NextResponse.json({ error: '메시지 내용을 입력해주세요.' }, { status: 400 })
  }

  // Resolve recipient name for display
  let recipientName: string | null = null
  let teamName: string | null = null

  if (body.recipient_id) {
    const { data: rp } = await supabase
      .from('cg_profiles')
      .select('full_name')
      .eq('id', body.recipient_id)
      .single()
    recipientName = (rp as any)?.full_name ?? null
  } else if (body.team_id) {
    const { data: team } = await supabase
      .from('cg_teams')
      .select('name')
      .eq('id', body.team_id)
      .single()
    teamName = (team as any)?.name ?? null
  }

  const { data, error } = await (supabase as any)
    .from('cg_messages')
    .insert({
      sender_id:      user.id,
      sender_name:    (senderProfile as any)?.full_name ?? '알 수 없음',
      recipient_id:   body.recipient_id   ?? null,
      recipient_name: recipientName,
      team_id:        body.team_id        ?? null,
      team_name:      teamName,
      content:        body.content.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE — 전체 삭제 (받은 메시지 또는 보낸 메시지 일괄 숨김)
// ?type=received | sent  (필수)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  if (type !== 'received' && type !== 'sent') {
    return NextResponse.json({ error: 'type 쿼리는 received 또는 sent 여야 합니다.' }, { status: 400 })
  }

  let messages: { id: string }[] = []

  if (type === 'sent') {
    const { data } = await (supabase as any)
      .from('cg_messages')
      .select('id')
      .eq('sender_id', user.id)
    messages = (data ?? []) as { id: string }[]
  } else {
    const { data: profile } = await supabase
      .from('cg_profiles')
      .select('team_id')
      .eq('id', user.id)
      .single()
    const orFilter = profile?.team_id
      ? `recipient_id.eq.${user.id},team_id.eq.${profile.team_id}`
      : `recipient_id.eq.${user.id}`
    const { data } = await (supabase as any)
      .from('cg_messages')
      .select('id')
      .or(orFilter)
    messages = (data ?? []) as { id: string }[]
  }

  if (messages.length === 0) {
    return NextResponse.json({ hidden: 0 })
  }

  // upsert (이미 숨긴 항목은 그대로) — primary key (message_id, user_id) 충돌 무시
  const rows = messages.map(m => ({ message_id: m.id, user_id: user.id }))
  const { error } = await (supabase as any)
    .from('cg_message_hides')
    .upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ hidden: messages.length })
}
