import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// KST(+9) 기준 날짜/시각 문자열
function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10)
}
function kstTimeStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(11, 16)
}

// 기존 확정 휴가/대기 신청과의 충돌 판정.
// 종일끼리·종일↔반차는 겹치면 충돌. 같은 날 반차끼리는 서로 다른 시간대(오전/오후)면 허용.
function hasVacationConflict(
  existing: { start_at: string; is_all_day: boolean | null }[],
  allDay: boolean,
  sDate: string,
  startAt: string,
): boolean {
  return existing.some(x => {
    const xAllDay = x.is_all_day ?? true
    if (allDay || xAllDay) return true
    return kstDateStr(x.start_at) === sDate && kstTimeStr(x.start_at) === kstTimeStr(startAt)
  })
}

// POST: 휴가 신청
//   - 앱관리자(super_admin) 본인 신청: 즉시 cg_events 생성 (자기 결재)
//   - 그 외 → cg_vacation_requests pending 으로 저장 + 결재자(또는 앱관리자)에게 메시지 발송
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
  const { title, description, start_at, end_at, is_all_day, target_user_id } = body as {
    title?: string
    description?: string | null
    start_at?: string
    end_at?: string
    is_all_day?: boolean
    target_user_id?: string | null
  }

  if (!title || !start_at || !end_at) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }

  // ── 신청 검증 (계산식/잔여일수 판정과 무관한 형식·중복 검증) ──────────
  const allDay = is_all_day ?? true
  const sDate = kstDateStr(start_at)
  const eDate = kstDateStr(end_at)

  // 1) 역순 날짜
  if (eDate < sDate) {
    return NextResponse.json({ error: '종료일이 시작일보다 빠를 수 없습니다.' }, { status: 400 })
  }
  // 2) 반차 기간 — 반차(반일)는 하루만 신청 가능
  if (!allDay && sDate !== eDate) {
    return NextResponse.json({ error: '반차는 하루만 신청할 수 있습니다.' }, { status: 400 })
  }

  // ── 대리 신청 (앱관리자가 지정한 전사 1명의 대리 게시자만 가능) ──────
  //    A안: 자동 승인 없이 항상 대상자의 결재 규칙대로 진행
  //    (지정 결재자 → 없으면 앱관리자 결재). RLS(vac_req_self_insert)가
  //    본인 신청만 허용하므로, 권한 검증 후 service-role로 INSERT 한다.
  if (target_user_id && target_user_id !== user.id) {
    const admin = createAdminClient()

    const { data: cs } = await admin
      .from('cg_company_settings')
      .select('vacation_proxy_user_id')
      .single()
    if (!cs || cs.vacation_proxy_user_id !== user.id) {
      return NextResponse.json({ error: '휴가 대리 게시 권한이 없습니다.' }, { status: 403 })
    }

    const [{ data: proxy }, { data: target }] = await Promise.all([
      admin.from('cg_profiles').select('full_name').eq('id', user.id).single(),
      admin
        .from('cg_profiles')
        .select('id, full_name, status, role, is_super_admin, approver_id')
        .eq('id', target_user_id)
        .single(),
    ])
    if (!target || target.status !== 'active') {
      return NextResponse.json({ error: '대상자를 찾을 수 없거나 활성 상태가 아닙니다.' }, { status: 400 })
    }
    if (isSuperAdmin(target)) {
      return NextResponse.json({ error: '앱관리자는 대리 신청 대상이 될 수 없습니다.' }, { status: 400 })
    }

    // 중복 검증 — 대상자 기준
    const [{ data: tEvOverlap }, { data: tReqOverlap }] = await Promise.all([
      admin
        .from('cg_events')
        .select('start_at, is_all_day')
        .eq('created_by', target.id)
        .eq('is_vacation', true)
        .lte('start_at', end_at)
        .gte('end_at', start_at),
      admin
        .from('cg_vacation_requests')
        .select('start_at, is_all_day')
        .eq('requested_by', target.id)
        .eq('status', 'pending')
        .lte('start_at', end_at)
        .gte('end_at', start_at),
    ])
    if (hasVacationConflict([...(tEvOverlap ?? []), ...(tReqOverlap ?? [])], allDay, sDate, start_at)) {
      return NextResponse.json({ error: '대상자에게 이미 해당 기간에 등록되었거나 결재 대기 중인 휴가가 있습니다.' }, { status: 400 })
    }

    const targetApproverId = (target as any).approver_id as string | null
    const { data: proxyReq, error: proxyErr } = await admin
      .from('cg_vacation_requests')
      .insert({
        requested_by: target.id,
        approver_id: targetApproverId,
        title,
        description: description ?? null,
        start_at,
        end_at,
        is_all_day: allDay,
        status: 'pending',
        posted_by: user.id,
      })
      .select()
      .single()
    if (proxyErr) return NextResponse.json({ error: proxyErr.message }, { status: 500 })

    // 알림 — 결재자(또는 앱관리자 전원) + 대상자 본인
    const proxyName = proxy?.full_name ?? '알 수 없음'
    const proxyDateLabel = new Date(start_at).toLocaleDateString('ko-KR', {
      month: 'numeric', day: 'numeric',
    })
    const approverMsg = `[휴가 결재 요청] ${target.full_name} 님의 ${proxyDateLabel} 휴가를 ${proxyName} 님이 대리 신청했습니다.`

    if (targetApproverId) {
      const { data: approver } = await admin
        .from('cg_profiles')
        .select('full_name')
        .eq('id', targetApproverId)
        .single()
      await (admin as any).from('cg_messages').insert({
        sender_id:      user.id,
        sender_name:    proxyName,
        recipient_id:   targetApproverId,
        recipient_name: (approver as any)?.full_name ?? null,
        content:        approverMsg,
      })
    } else {
      const { data: admins } = await admin
        .from('cg_profiles')
        .select('id, full_name')
        .eq('is_super_admin', true)
        .eq('status', 'active')
      if (admins && admins.length > 0) {
        const rows = admins.map(a => ({
          sender_id:      user.id,
          sender_name:    proxyName,
          recipient_id:   a.id,
          recipient_name: a.full_name,
          content:        approverMsg,
        }))
        await (admin as any).from('cg_messages').insert(rows)
      }
    }

    await (admin as any).from('cg_messages').insert({
      sender_id:      user.id,
      sender_name:    proxyName,
      recipient_id:   target.id,
      recipient_name: target.full_name,
      content:        `[휴가 대리 신청] ${proxyName} 님이 회원님의 ${proxyDateLabel} 휴가를 신청했습니다. 결재 승인 후 확정됩니다.`,
    })

    return NextResponse.json({ mode: 'pending', request: proxyReq }, { status: 201 })
  }

  // 3) 중복 — 본인의 확정 휴가(이벤트) 또는 대기 중 신청과 기간이 겹치면 차단.
  //    종일끼리·종일↔반차는 겹치면 충돌. 같은 날 반차끼리는 서로 다른 시간대(오전/오후)면 허용.
  const [{ data: evOverlap }, { data: reqOverlap }] = await Promise.all([
    supabase
      .from('cg_events')
      .select('start_at, is_all_day')
      .eq('created_by', user.id)
      .eq('is_vacation', true)
      .lte('start_at', end_at)
      .gte('end_at', start_at),
    supabase
      .from('cg_vacation_requests')
      .select('start_at, is_all_day')
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .lte('start_at', end_at)
      .gte('end_at', start_at),
  ])

  if (hasVacationConflict([...(evOverlap ?? []), ...(reqOverlap ?? [])], allDay, sDate, start_at)) {
    return NextResponse.json({ error: '이미 해당 기간에 등록되었거나 결재 대기 중인 휴가가 있습니다.' }, { status: 400 })
  }

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role, is_super_admin, approver_id, full_name, team_id')
    .eq('id', user.id)
    .single()

  if (!me) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 })

  // 자기 결재(자동 승인): 결재자 역할(관리자 또는 앱관리자)이면서 외부 결재자 미지정인 경우.
  //   - 자기 자신을 결재자로 두는 건 DB 제약상 불가하므로 "본인 결재" = approver_id IS NULL.
  //   - 휴가 신청은 자동 승인되지만, 취소 신청은 항상 앱관리자가 결재해야 한다
  //     (취소 흐름은 /api/vacation-cancel-requests 에서 별도 처리).
  const myRole = (me as any).role
  const isApproverRole = myRole === 'manager' || isSuperAdmin(me)
  const isSelfApproved = isApproverRole && (me as any).approver_id == null

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
    // approver 미지정 → 모든 활성 앱관리자에게 알림
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

  return NextResponse.json({ mode: 'pending', request: req }, { status: 201 })
}
