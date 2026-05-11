import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: 휴가 취소 신청 생성
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { event_id, reason } = await request.json()
  if (!event_id) return NextResponse.json({ error: 'event_id is required' }, { status: 400 })

  const { data: event } = await supabase
    .from('cg_events')
    .select('id, created_by, is_vacation')
    .eq('id', event_id)
    .single()

  if (!event) return NextResponse.json({ error: '일정을 찾을 수 없습니다.' }, { status: 404 })
  if (event.created_by !== user.id) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  if (!event.is_vacation) return NextResponse.json({ error: '휴가 일정만 취소 신청이 가능합니다.' }, { status: 400 })

  const { data: existing } = await supabase
    .from('cg_vacation_cancel_requests')
    .select('id')
    .eq('event_id', event_id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return NextResponse.json({ error: '이미 취소 신청이 진행 중입니다.' }, { status: 400 })

  const { data, error } = await supabase
    .from('cg_vacation_cancel_requests')
    .insert({ event_id, requested_by: user.id, reason: reason || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// GET: 대기 중인 취소 요청 목록 (관리자 전용)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // 일반 사용자: 본인의 대기 중 취소 신청 event_id 목록만 반환
  if (profile?.role !== 'admin') {
    const { data, error } = await supabase
      .from('cg_vacation_cancel_requests')
      .select('id, event_id, status')
      .eq('requested_by', user.id)
      .eq('status', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // 관리자: 전체 요청 (모든 상태)
  const { data, error } = await supabase
    .from('cg_vacation_cancel_requests')
    .select(`
      *,
      requester:cg_profiles!requested_by(id, full_name, color),
      event:cg_events(id, title, start_at, end_at, is_all_day)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
