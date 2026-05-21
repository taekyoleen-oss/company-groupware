import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

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

  // 결재자/앱관리자 알림
  const { data: me } = await supabase
    .from('cg_profiles')
    .select('full_name, approver_id')
    .eq('id', user.id)
    .single()
  const requesterName = (me as any)?.full_name ?? '알 수 없음'
  const approverId = (me as any)?.approver_id as string | null
  const content = `[휴가 취소 결재 요청] ${requesterName} 님이 휴가 취소를 신청했습니다.`

  if (approverId) {
    const { data: approver } = await supabase
      .from('cg_profiles')
      .select('full_name')
      .eq('id', approverId)
      .single()
    await (supabase as any).from('cg_messages').insert({
      sender_id:      user.id,
      sender_name:    requesterName,
      recipient_id:   approverId,
      recipient_name: (approver as any)?.full_name ?? null,
      content,
    })
  } else {
    const { data: admins } = await supabase
      .from('cg_profiles')
      .select('id, full_name')
      .eq('is_super_admin', true)
      .eq('status', 'active')

    if (admins && admins.length > 0) {
      const rows = admins.map(a => ({
        sender_id:      user.id,
        sender_name:    requesterName,
        recipient_id:   a.id,
        recipient_name: a.full_name,
        content,
      }))
      await (supabase as any).from('cg_messages').insert(rows)
    }
  }

  return NextResponse.json(data, { status: 201 })
}

// GET: 권한별 취소 신청 목록
//   - 관리자: 전체 (대기/이력 모두). 각 행에 requester.approver_id 포함 → UI에서 본인 결재 분 분기
//   - 일반 사용자(결재자 포함): 본인 결재 직원 건 + 본인의 pending
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()

  const isAdmin = isSuperAdmin(profile)

  if (isAdmin) {
    // 관리자: 전체. requester profile에 approver_id 포함
    const { data, error } = await supabase
      .from('cg_vacation_cancel_requests')
      .select(`
        *,
        requester:cg_profiles!requested_by(id, full_name, color, approver_id),
        reviewer:cg_profiles!reviewed_by(id, full_name, color),
        event:cg_events(id, title, start_at, end_at, is_all_day)
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // 일반 사용자/결재자: 본인 결재 직원 건 + 본인의 pending
  // (1) 본인이 결재하는 직원 id 목록
  const { data: myEmployees } = await supabase
    .from('cg_profiles')
    .select('id')
    .eq('approver_id', user.id)
  const empIds = (myEmployees ?? []).map(e => e.id)

  // (2) 본인 pending + 본인 결재 직원 건을 OR
  const orFilter = empIds.length > 0
    ? `requested_by.eq.${user.id},requested_by.in.(${empIds.join(',')})`
    : `requested_by.eq.${user.id}`

  const { data, error } = await supabase
    .from('cg_vacation_cancel_requests')
    .select(`
      id, event_id, status, reason, created_at, reviewed_at, requested_by,
      event_title, event_start_at, event_end_at, event_is_all_day,
      requester:cg_profiles!requested_by(id, full_name, color, approver_id),
      reviewer:cg_profiles!reviewed_by(id, full_name, color),
      event:cg_events(id, title, start_at, end_at, is_all_day)
    `)
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
