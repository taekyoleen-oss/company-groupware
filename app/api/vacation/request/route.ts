import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: 휴가 신청
//   - 본인이 결재자(admin AND approver_id IS NULL)인 경우 → cg_events 즉시 생성 (자동 승인)
//   - 그 외 → cg_vacation_requests 에 pending 으로 저장 + 결재자에게 메시지 발송
//
// Request body
//   { title, description, start_at, end_at, is_all_day }
//
// Response
//   { mode: 'auto' | 'pending', event?: cg_events row, request?: cg_vacation_requests row }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { title, description, start_at, end_at, is_all_day } = body as {
    title?: string
    description?: string | null
    start_at?: string
    end_at?: string
    is_all_day?: boolean
  }

  if (!title || !start_at || !end_at) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role, approver_id, full_name, team_id')
    .eq('id', user.id)
    .single()

  if (!me) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 })

  const isSelfApproved = (me as any).role === 'admin' && (me as any).approver_id == null

  // ── 자동 승인 (본인이 결재자) ─────────────────────────────────
  if (isSelfApproved) {
    const { data: event, error: eventErr } = await supabase
      .from('cg_events')
      .insert({
        title,
        description: description ?? null,
        start_at,
        end_at,
        is_all_day: is_all_day ?? true,
        is_vacation: true,
        visibility: 'company',
        color: '#F97316',
        category_id: null,
        created_by: user.id,
        team_id: null,
      })
      .select()
      .single()
    if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 })
    return NextResponse.json({ mode: 'auto', event }, { status: 201 })
  }

  // ── 결재 필요 ─────────────────────────────────────────────
  const approverId = (me as any).approver_id as string | null

  const { data: req, error: reqErr } = await supabase
    .from('cg_vacation_requests')
    .insert({
      requested_by: user.id,
      approver_id: approverId,
      title,
      description: description ?? null,
      start_at,
      end_at,
      is_all_day: is_all_day ?? true,
      status: 'pending',
    })
    .select()
    .single()

  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })

  // ── 결재자 알림 ──────────────────────────────────────────
  const requesterName = (me as any).full_name ?? '알 수 없음'
  const dateLabel = new Date(start_at).toLocaleDateString('ko-KR', {
    month: 'numeric', day: 'numeric',
  })
  const content = `[휴가 결재 요청] ${requesterName} 님이 ${dateLabel} 휴가를 신청했습니다.`

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
    // approver 미지정 → 모든 활성 관리자에게 알림
    const { data: admins } = await supabase
      .from('cg_profiles')
      .select('id, full_name')
      .eq('role', 'admin')
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

  return NextResponse.json({ mode: 'pending', request: req }, { status: 201 })
}
