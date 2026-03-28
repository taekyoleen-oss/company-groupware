import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'sent' | 'received' (default)

  if (type === 'sent') {
    const { data, error } = await (supabase as any)
      .from('cg_messages')
      .select('*')
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
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
  return NextResponse.json(data)
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
