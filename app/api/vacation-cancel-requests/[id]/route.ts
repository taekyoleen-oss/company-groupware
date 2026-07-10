import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// PATCH: 취소 신청 승인 또는 거부
//   - 관리자: 본인이 결재자(approver_id == null)인 직원만 처리
//   - 결재자(일반): 본인이 결재자인 직원만 처리
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('cg_profiles')
      .select('id, role, is_super_admin, full_name')
      .eq('id', user.id)
      .single()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isAdmin = isSuperAdmin(me)

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

    // 결재 권한 판정: 대상 직원의 approver_id가 본인이거나, NULL이면서 본인이 관리자
    const { data: requesterProfile } = await supabase
      .from('cg_profiles')
      .select('full_name, approver_id')
      .eq('id', cancelReq.requested_by)
      .single()

    if (!requesterProfile) {
      return NextResponse.json({ error: '신청자 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const targetApproverId = (requesterProfile as any).approver_id as string | null
    const canApprove = (targetApproverId == null && isAdmin) || targetApproverId === user.id
    if (!canApprove) {
      return NextResponse.json({ error: '이 신청을 결재할 권한이 없습니다.' }, { status: 403 })
    }

    const reviewerName = (me as any).full_name ?? '결재자'
    const requesterName = (requesterProfile as any).full_name ?? null

    // 이벤트 스냅샷
    let eventSnapshot: {
      event_title: string | null
      event_start_at: string | null
      event_end_at: string | null
      event_is_all_day: boolean | null
    } = { event_title: null, event_start_at: null, event_end_at: null, event_is_all_day: null }

    if (cancelReq.event_id) {
      const { data: ev } = await supabase
        .from('cg_events')
        .select('title, start_at, end_at, is_all_day')
        .eq('id', cancelReq.event_id)
        .single()
      if (ev) {
        eventSnapshot = {
          event_title:      ev.title,
          event_start_at:   ev.start_at,
          event_end_at:     ev.end_at,
          event_is_all_day: ev.is_all_day,
        }
      }
    }

    const reviewedAt = new Date().toISOString()

    if (action === 'approve') {
      // 스냅샷 기록 + 휴가 이벤트 삭제를 단일 트랜잭션 RPC 로 원자 처리한다.
      //   - 행 잠금으로 동시 승인을 직렬화, 부분 실패(스냅샷만 되고 이벤트가 남는 상태) 방지.
      //   - RPC 는 service_role 만 실행 가능 (권한은 위 canApprove 로 이미 검증).
      const admin = await createAdminClient()
      const { error: rpcErr } = await (admin as any).rpc('approve_vacation_cancel', {
        p_cancel_id: id,
        p_reviewer_id: user.id,
      })

      if (rpcErr) {
        const msg = rpcErr.message ?? ''
        if (msg.includes('ALREADY_PROCESSED')) {
          return NextResponse.json({ error: '이미 처리된 요청입니다.' }, { status: 400 })
        }
        if (msg.includes('REQUEST_NOT_FOUND')) {
          return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 })
        }
        return NextResponse.json({ error: `승인 처리 실패: ${msg}` }, { status: 500 })
      }
    } else {
      const { error: updateError } = await (supabase as any)
        .from('cg_vacation_cancel_requests')
        .update({
          status:      'rejected',
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
          ...eventSnapshot,
        })
        .eq('id', id)

      if (updateError) {
        return NextResponse.json(
          { error: `거부 처리 실패: ${updateError.message}` },
          { status: 500 }
        )
      }
    }

    const content = action === 'approve'
      ? `[휴가 취소 승인] 신청하신 휴가 취소가 승인되었습니다. 결재자: ${reviewerName}`
      : `[휴가 취소 거부] 신청하신 휴가 취소가 거부되었습니다. 결재자: ${reviewerName}`

    const { error: msgError } = await (supabase as any)
      .from('cg_messages')
      .insert({
        sender_id:      user.id,
        sender_name:    reviewerName,
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
