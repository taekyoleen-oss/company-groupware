import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 통합 휴가 처리 이력
//   - 휴가 등록(grant): cg_events.is_vacation = true
//   - 휴가 취소 승인(cancel_approved) / 거부(cancel_rejected): cg_vacation_cancel_requests
//
// 스코프
//   - 관리자: 전체
//   - 결재자(일반): 본인이 결재하는 직원만
//   - 그 외: 빈 배열
//
// 응답 항목 공통 필드
//   - id: 안정 식별자 (event id 또는 cancel request id, prefix로 구분)
//   - kind: 'grant' | 'cancel_approved' | 'cancel_rejected'
//   - happened_at: 정렬 기준 (grant=created_at, cancel=reviewed_at)
//   - requester: { id, full_name, color }
//   - event_title / event_start_at / event_end_at / event_is_all_day
//   - reviewer (cancel만)
//   - reason (cancel만)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = (me as any).role === 'admin'

  // 결재자 모드: 본인을 결재자로 둔 직원 목록
  let allowedRequesterIds: string[] | null = null
  if (!isAdmin) {
    const { data: emps } = await supabase
      .from('cg_profiles')
      .select('id')
      .eq('approver_id', user.id)
    allowedRequesterIds = (emps ?? []).map(e => e.id)
  }

  // 현재 연도 기준 (UI 일관성)
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear - 1}-12-22T00:00:00.000Z`
  const yearEnd = `${currentYear}-12-31T23:59:59.999Z`

  // 1) 휴가 등록 (grant) — 현재 살아있는 휴가 이벤트
  let eventsQuery = supabase
    .from('cg_events')
    .select(`
      id, title, start_at, end_at, is_all_day, created_at, created_by,
      requester:cg_profiles!created_by(id, full_name, color, approver_id)
    `)
    .eq('is_vacation', true)
    .gte('start_at', yearStart)
    .lte('start_at', yearEnd)

  if (!isAdmin) {
    if (!allowedRequesterIds || allowedRequesterIds.length === 0) {
      eventsQuery = eventsQuery.in('created_by', ['00000000-0000-0000-0000-000000000000']) // empty
    } else {
      eventsQuery = eventsQuery.in('created_by', allowedRequesterIds)
    }
  }

  const { data: events } = await eventsQuery

  // 2) 휴가 취소 처리 (승인/거부) — 처리된 요청만
  let cancelQuery = supabase
    .from('cg_vacation_cancel_requests')
    .select(`
      id, status, reason, created_at, reviewed_at, requested_by,
      event_title, event_start_at, event_end_at, event_is_all_day,
      requester:cg_profiles!requested_by(id, full_name, color, approver_id),
      reviewer:cg_profiles!reviewed_by(id, full_name, color),
      event:cg_events(id, title, start_at, end_at, is_all_day)
    `)
    .in('status', ['approved', 'rejected'])
    .order('reviewed_at', { ascending: false })
    .limit(200)

  if (!isAdmin) {
    if (!allowedRequesterIds || allowedRequesterIds.length === 0) {
      cancelQuery = cancelQuery.in('requested_by', ['00000000-0000-0000-0000-000000000000'])
    } else {
      cancelQuery = cancelQuery.in('requested_by', allowedRequesterIds)
    }
  }

  const { data: cancels } = await cancelQuery

  const grantItems = (events ?? []).map((e: any) => ({
    id: `grant:${e.id}`,
    kind: 'grant' as const,
    happened_at: e.created_at as string,
    requester: e.requester,
    event_title: e.title as string,
    event_start_at: e.start_at as string,
    event_end_at: e.end_at as string,
    event_is_all_day: e.is_all_day as boolean,
    reviewer: null as null,
    reason: null as null,
  }))

  const cancelItems = (cancels ?? []).map((c: any) => ({
    id: `cancel:${c.id}`,
    kind: (c.status === 'approved' ? 'cancel_approved' : 'cancel_rejected') as
      | 'cancel_approved'
      | 'cancel_rejected',
    happened_at: (c.reviewed_at ?? c.created_at) as string,
    requester: c.requester,
    event_title: c.event?.title ?? c.event_title ?? '(휴가)',
    event_start_at: c.event?.start_at ?? c.event_start_at,
    event_end_at: c.event?.end_at ?? c.event_end_at,
    event_is_all_day: c.event?.is_all_day ?? c.event_is_all_day ?? true,
    reviewer: c.reviewer,
    reason: c.reason,
  }))

  const combined = [...grantItems, ...cancelItems].sort((a, b) => {
    const ta = a.happened_at ? new Date(a.happened_at).getTime() : 0
    const tb = b.happened_at ? new Date(b.happened_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json(combined)
}
