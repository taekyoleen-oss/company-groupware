import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH: 취소 신청 승인 또는 거부 (관리자 전용)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('cg_profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = (body as any).action
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const { data: cancelReq, error: fetchError } = await supabase
      .from('cg_vacation_cancel_requests')
      .select('id, event_id, requested_by, status')
      .eq('id', id)
      .single()

    if (fetchError || !cancelReq) {
      return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (cancelReq.status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })
    }

    // 신청자 이름 별도 조회 (알림 표시용)
    const { data: requesterProfile } = await supabase
      .from('cg_profiles')
      .select('full_name')
      .eq('id', cancelReq.requested_by)
      .single()

    const adminName = (profile as any)?.full_name ?? '관리자'
    const requesterName = (requesterProfile as any)?.full_name ?? null

    if (action === 'approve') {
      // 휴가 일정 삭제 → cg_vacation_cancel_requests 도 ON DELETE CASCADE 로 함께 제거됨
      const { error: deleteError } = await supabase
        .from('cg_events')
        .delete()
        .eq('id', cancelReq.event_id)

      if (deleteError) {
        return NextResponse.json(
          { error: `휴가 일정 삭제 실패: ${deleteError.message}` },
          { status: 500 }
        )
      }
    } else {
      // 거부: 상태만 'rejected' 로 업데이트
      const { error: updateError } = await supabase
        .from('cg_vacation_cancel_requests')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) {
        return NextResponse.json(
          { error: `거부 처리 실패: ${updateError.message}` },
          { status: 500 }
        )
      }
    }

    // 신청자에게 결과 알림 발송 (실패해도 메인 처리는 성공으로 응답)
    const content = action === 'approve'
      ? `[휴가 취소 승인] 신청하신 휴가 취소가 승인되었습니다. 작성자: ${adminName}`
      : `[휴가 취소 거부] 신청하신 휴가 취소가 거부되었습니다. 작성자: ${adminName}`

    const { error: msgError } = await (supabase as any)
      .from('cg_messages')
      .insert({
        sender_id:      user.id,
        sender_name:    adminName,
        recipient_id:   cancelReq.requested_by,
        recipient_name: requesterName,
        content,
      })

    if (msgError) {
      console.error('[vacation-cancel-requests] notification insert failed:', msgError)
    }

    return NextResponse.json({
      success: true,
      action,
      notified: !msgError,
    })
  } catch (err) {
    console.error('[vacation-cancel-requests] PATCH unexpected error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `처리 중 오류가 발생했습니다: ${message}` }, { status: 500 })
  }
}
