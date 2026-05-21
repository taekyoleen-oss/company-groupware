import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// GET: 통합 휴가 처리 이력
//   - 휴가 등록(grant): cg_events.is_vacation = true
//   - 휴가 신청 거부(request_rejected): cg_vacation_requests where status='rejected'
//   - 휴가 취소 승인(cancel_approved) / 거부(cancel_rejected): cg_vacation_cancel_requests
//
// 스코프
//   - 관리자: 전체
//   - 결재자(일반): 본인이 결재하는 직원만
//   - 그 외: 빈 배열

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = isSuperAdmin(me)

  let allowedRequesterIds: string[] | null = null
  if (!isAdmin) {
    const { data: emps } = await supabase
      .from('cg_profiles')
      .select('id')
      .eq('approver_id', user.id)
    allowedRequesterIds = (emps ?? []).map(e => e.id)
  }

  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear - 1}-12-22T00:00:00.000Z`
  const yearEnd = `${currentYear}-12-31T23:59:59.999Z`

  // 1) 휴가 등록 (grant)
  // 결재자 정보 보강: cg_vacation_requests에서 event_id 매핑
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
      eventsQuery = eventsQuery.in('created_by', ['00000000-0000-0000-0000-000000000000'])
    } else {
      eventsQuery = eventsQuery.in('created_by', allowedRequesterIds)
    }
  }

  const { data: events } = await eventsQuery

  // 결재자 정보를 위한 vacation_requests 룩업 (승인된 건)
  const eventIds = (events ?? []).map((e: any) => e.id).filter(Boolean)
  let approvedRequestMap: Record<string, { reviewer: any; reviewed_at: string | null }> = {}
  if (eventIds.length > 0) {
    const { data: approvedReqs } = await supabase
      .from('cg_vacation_requests')
      .select('event_id, reviewed_at, reviewer:cg_profiles!reviewed_by(id, full_name, color)')
      .in('event_id', eventIds)
      .eq('status', 'approved')
    for (const r of (approvedReqs ?? []) as any[]) {
      if (r.event_id) approvedRequestMap[r.event_id] = { reviewer: r.reviewer, reviewed_at: r.reviewed_at }
    }
  }

  // 2) 휴가 신청 거부 (request_rejected)
  let rejectedReqQuery = supabase
    .from('cg_vacation_requests')
    .select(`
      id, title, start_at, end_at, is_all_day, created_at, requested_by, reject_reason, reviewed_at,
      requester:cg_profiles!requested_by(id, full_name, color, approver_id),
      reviewer:cg_profiles!reviewed_by(id, full_name, color)
    `)
    .eq('status', 'rejected')
    .order('reviewed_at', { ascending: false })
    .limit(200)

  if (!isAdmin) {
    if (!allowedRequesterIds || allowedRequesterIds.length === 0) {
      rejectedReqQuery = rejectedReqQuery.in('requested_by', ['00000000-0000-0000-0000-000000000000'])
    } else {
      rejectedReqQuery = rejectedReqQuery.in('requested_by', allowedRequesterIds)
    }
  }

  const { data: rejectedReqs } = await rejectedReqQuery

  // 3) 휴가 취소 처리 (cancel_approved / cancel_rejected)
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

  const grantItems = (events ?? []).map((e: any) => {
    const approvedReq = approvedRequestMap[e.id]
    return {
      id: `grant:${e.id}`,
      kind: 'grant' as const,
      happened_at: (approvedReq?.reviewed_at ?? e.created_at) as string,
      requester: e.requester,
      event_title: e.title as string,
      event_start_at: e.start_at as string,
      event_end_at: e.end_at as string,
      event_is_all_day: e.is_all_day as boolean,
      reviewer: approvedReq?.reviewer ?? null,
      reason: null as null,
    }
  })

  const rejectedRequestItems = (rejectedReqs ?? []).map((r: any) => ({
    id: `vreq_rej:${r.id}`,
    kind: 'request_rejected' as const,
    happened_at: (r.reviewed_at ?? r.created_at) as string,
    requester: r.requester,
    event_title: r.title as string,
    event_start_at: r.start_at as string,
    event_end_at: r.end_at as string,
    event_is_all_day: r.is_all_day as boolean,
    reviewer: r.reviewer,
    reason: r.reject_reason as string | null,
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

  const combined = [...grantItems, ...rejectedRequestItems, ...cancelItems].sort((a, b) => {
    const ta = a.happened_at ? new Date(a.happened_at).getTime() : 0
    const tb = b.happened_at ? new Date(b.happened_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json(combined)
}
