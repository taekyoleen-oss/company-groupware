import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// KST(+9) 기준 날짜/시각 문자열
function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10)
}
function kstTimeStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(11, 16)
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

  const existing = [...(evOverlap ?? []), ...(reqOverlap ?? [])]
  const hasConflict = existing.some((x: any) => {
    const xAllDay = x.is_all_day ?? true
    if (allDay || xAllDay) return true // 어느 한쪽이 종일이면 기간 겹침 = 충돌
    // 둘 다 반차 & 같은 날 → 같은 시간대면 충돌, 다르면(오전/오후) 허용
    return kstDateStr(x.start_at) === sDate && kstTimeStr(x.start_at) === kstTimeStr(start_at)
  })
  if (hasConflict) {
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
