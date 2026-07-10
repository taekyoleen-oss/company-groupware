import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// PATCH: 휴가 신청 승인/거부
//   - 앱관리자(super_admin): 대상 신청의 approver_id가 NULL일 때 처리 (관리자/실무자 공용 폴백)
//   - 결재자(관리자/manager): approver_id가 본인일 때만 처리
//   - 승인 → cg_events 생성 + request.status='approved' + event_id 저장 + 신청자 알림
//   - 거부 → request.status='rejected' + reject_reason 저장 + 신청자 알림
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
    const rejectReason: string | null = (body as any).reject_reason ?? null
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const { data: req, error: fetchErr } = await supabase
      .from('cg_vacation_requests')
      .select('id, requested_by, approver_id, title, description, start_at, end_at, is_all_day, status, event_id')
      .eq('id', id)
      .single()
    if (fetchErr || !req) {
      return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 })
    }
    if ((req as any).status !== 'pending') {
      return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })
    }

    // 권한
    const r = req as any
    const canHandle = (r.approver_id == null && isAdmin) || r.approver_id === user.id
    if (!canHandle) {
      return NextResponse.json({ error: '이 신청을 결재할 권한이 없습니다.' }, { status: 403 })
    }

    // 신청자 정보
    const { data: requesterProfile } = await supabase
      .from('cg_profiles')
      .select('full_name')
      .eq('id', r.requested_by)
      .single()

    const reviewerName = (me as any).full_name ?? '결재자'
    const requesterName = (requesterProfile as any)?.full_name ?? null
    const reviewedAt = new Date().toISOString()

    if (action === 'approve') {
      // 이벤트 생성 + 신청 상태 갱신을 단일 트랜잭션 RPC 로 원자 처리한다.
      //   - 행 잠금(FOR UPDATE)으로 동시 승인을 직렬화 → 이벤트 중복 생성/이중 차감 차단.
      //   - RPC 는 service_role 만 실행 가능하므로 admin client 로 호출 (권한은 위 canHandle 로 이미 검증).
      const admin = await createAdminClient()
      const { error: rpcErr } = await (admin as any).rpc('approve_vacation_request', {
        p_request_id: id,
        p_reviewer_id: user.id,
      })

      if (rpcErr) {
        const msg = rpcErr.message ?? ''
        if (msg.includes('ALREADY_PROCESSED')) {
          return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 })
        }
        if (msg.includes('REQUEST_NOT_FOUND')) {
          return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 })
        }
        return NextResponse.json({ error: `승인 처리 실패: ${msg}` }, { status: 500 })
      }
    } else {
      const { error: updErr } = await (supabase as any)
        .from('cg_vacation_requests')
        .update({
          status: 'rejected',
          reject_reason: rejectReason,
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
        })
        .eq('id', id)

      if (updErr) {
        return NextResponse.json({ error: `거부 처리 실패: ${updErr.message}` }, { status: 500 })
      }
    }

    // 알림
    const dateLabel = r.start_at
      ? new Date(r.start_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
      : '-'
    const content = action === 'approve'
      ? `[휴가 승인] ${dateLabel} 휴가 신청이 승인되었습니다. 결재자: ${reviewerName}`
      : `[휴가 거부] ${dateLabel} 휴가 신청이 거부되었습니다. 결재자: ${reviewerName}${rejectReason ? ` · 사유: ${rejectReason}` : ''}`

    await (supabase as any).from('cg_messages').insert({
      sender_id:      user.id,
      sender_name:    reviewerName,
      recipient_id:   r.requested_by,
      recipient_name: requesterName,
      content,
    })

    return NextResponse.json({ success: true, action })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `처리 중 오류가 발생했습니다: ${message}` }, { status: 500 })
  }
}

// DELETE: 본인 pending 신청 철회
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: req } = await supabase
    .from('cg_vacation_requests')
    .select('id, requested_by, status')
    .eq('id', id)
    .single()

  if (!req) return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 })
  if ((req as any).requested_by !== user.id) {
    return NextResponse.json({ error: '본인 신청만 철회할 수 있습니다.' }, { status: 403 })
  }
  if ((req as any).status !== 'pending') {
    return NextResponse.json({ error: '대기 중인 신청만 철회할 수 있습니다.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('cg_vacation_requests')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
