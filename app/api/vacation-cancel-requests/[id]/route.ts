import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH: 취소 신청 승인 또는 거부 (관리자 전용)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { action } = await request.json()
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const { data: cancelReq } = await supabase
    .from('cg_vacation_cancel_requests')
    .select('id, event_id, requested_by, status')
    .eq('id', id)
    .single()

  if (!cancelReq) return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 })
  if (cancelReq.status !== 'pending') return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })

  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  const { error: updateError } = await supabase
    .from('cg_vacation_cancel_requests')
    .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (action === 'approve') {
    const { error: deleteError } = await supabase
      .from('cg_events')
      .delete()
      .eq('id', cancelReq.event_id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // 신청자에게 결과 알림 메시지 발송
  const adminName = (profile as any)?.full_name ?? '관리자'
  const content = action === 'approve'
    ? `[휴가 취소 승인] 신청하신 휴가 취소가 승인되었습니다. 작성자: ${adminName}`
    : `[휴가 취소 거부] 신청하신 휴가 취소가 거부되었습니다. 작성자: ${adminName}`

  await (supabase as any).from('cg_messages').insert({
    sender_id: user.id,
    sender_name: adminName,
    recipient_id: cancelReq.requested_by,
    content,
  }).catch(() => {})

  return NextResponse.json({ success: true, status: newStatus })
}
