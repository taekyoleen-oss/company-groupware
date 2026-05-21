import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// PATCH: 휴가 신청 승인/거부
//   - 관리자: 대상 신청의 approver_id가 NULL일 때만 처리
//   - 결재자(일반): approver_id가 본인일 때만 처리
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
      .select('id, role, full_name')
      .eq('id', user.id)
      .single()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isAdmin = (me as any).role === 'admin'

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
      // 1) cg_events 생성 — 결재자가 신청자 명의로 휴가 일정을 만들기 위해 admin client 사용 (RLS 우회)
      const admin = await createAdminClient()
      const { data: event, error: eventErr } = await admin
        .from('cg_events')
        .insert({
          title: r.title,
          description: r.description,
          start_at: r.start_at,
          end_at: r.end_at,
          is_all_day: r.is_all_day,
          is_vacation: true,
          visibility: 'company',
          color: '#F97316',
          category_id: null,
          created_by: r.requested_by,
          team_id: null,
        })
        .select()
        .single()

      if (eventErr) {
        return NextResponse.json({ error: `이벤트 생성 실패: ${eventErr.message}` }, { status: 500 })
      }

      const { error: updErr } = await (supabase as any)
        .from('cg_vacation_requests')
        .update({
          status: 'approved',
          event_id: (event as any).id,
          reviewed_by: user.id,
          reviewed_at: reviewedAt,
        })
        .eq('id', id)

      if (updErr) {
        return NextResponse.json({ error: `승인 처리 실패: ${updErr.message}` }, { status: 500 })
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
