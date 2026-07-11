import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'
import { countWorkdays } from '@/lib/utils/holidayDates'

function toKSTDate(isoStr: string): string {
  return new Date(new Date(isoStr).getTime() + 9 * 3600000).toISOString().slice(0, 10)
}
function toKSTHour(isoStr: string): number {
  return new Date(new Date(isoStr).getTime() + 9 * 3600000).getUTCHours()
}
// 사용일수 계산 — 관리자 화면(/api/admin/vacation)과 동일 규칙
function calcDays(startAt: string, endAt: string, isAllDay: boolean): number {
  if (!isAllDay) return 0.5
  return countWorkdays(toKSTDate(startAt), toKSTDate(endAt))
}
function vacType(isAllDay: boolean, startAt: string): 'full' | 'morning' | 'afternoon' {
  if (isAllDay) return 'full'
  return toKSTHour(startAt) < 12 ? 'morning' : 'afternoon'
}

// GET: 특정 직원의 당해 연도 휴가 세부 내역 (확정 휴가 + 결재 대기)
//   권한: 앱관리자 또는 해당 직원의 지정 결재자
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: target } = await supabase
    .from('cg_profiles')
    .select('id, full_name, approver_id')
    .eq('id', userId)
    .single()
  if (!target) return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다.' }, { status: 404 })

  if (!isSuperAdmin(me) && target.approver_id !== me.id) {
    return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 })
  }

  const y = new Date().getFullYear()
  const rangeStart = `${y - 1}-12-22T00:00:00.000Z`
  const rangeEnd = `${y}-12-31T23:59:59.999Z`

  const [eventsRes, pendingRes, profilesRes] = await Promise.all([
    supabase
      .from('cg_events')
      .select('id, title, description, start_at, end_at, is_all_day')
      .eq('created_by', userId)
      .eq('is_vacation', true)
      .gte('start_at', rangeStart)
      .lte('start_at', rangeEnd)
      .order('start_at', { ascending: true }),
    supabase
      .from('cg_vacation_requests')
      .select('id, title, description, start_at, end_at, is_all_day, created_at, posted_by')
      .eq('requested_by', userId)
      .eq('status', 'pending')
      .gte('start_at', rangeStart)
      .lte('start_at', rangeEnd)
      .order('start_at', { ascending: true }),
    supabase.from('cg_profiles').select('id, full_name'),
  ])

  const nameOf: Record<string, string> = {}
  for (const p of profilesRes.data ?? []) nameOf[p.id] = p.full_name

  const used = (eventsRes.data ?? [])
    .filter(e => toKSTDate(e.start_at).slice(0, 4) === String(y))
    .map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      start_at: e.start_at,
      end_at: e.end_at,
      is_all_day: e.is_all_day ?? true,
      type: vacType(e.is_all_day ?? true, e.start_at),
      days: calcDays(e.start_at, e.end_at, e.is_all_day ?? true),
    }))

  const pending = ((pendingRes.data ?? []) as any[])
    .filter(r => toKSTDate(r.start_at).slice(0, 4) === String(y))
    .map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      start_at: r.start_at,
      end_at: r.end_at,
      is_all_day: r.is_all_day ?? true,
      type: vacType(r.is_all_day ?? true, r.start_at),
      days: calcDays(r.start_at, r.end_at, r.is_all_day ?? true),
      requested_at: r.created_at,
      posted_by_name: r.posted_by ? (nameOf[r.posted_by] ?? null) : null,
    }))

  return NextResponse.json({
    user: { id: target.id, full_name: target.full_name },
    year: y,
    used,
    pending,
  })
}

// PATCH: 휴가 관련 직원 속성 변경
//   - total_days: 앱관리자(대상의 approver=null) 또는 본인이 결재자인 결재자
//   - approver_id: 앱관리자만
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
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

  // 대상 직원 정보 (결재자 확인용)
  const { data: target, error: targetErr } = await supabase
    .from('cg_profiles')
    .select('id, approver_id, full_name')
    .eq('id', userId)
    .single()

  if (targetErr || !target) {
    return NextResponse.json({ error: '대상 회원을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 본인이 결재자인지(= 관리자이면서 approver_id=null이거나, approver_id=me.id)
  const isApproverForTarget = (target.approver_id == null && isAdmin) || target.approver_id === me.id

  const body = await request.json().catch(() => ({}))
  const { total_days, approver_id } = body as { total_days?: unknown; approver_id?: unknown }

  // 1) approver_id 변경: 앱관리자만
  if (approver_id !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: '결재자 지정은 앱관리자만 가능합니다.' }, { status: 403 })
    }
    let newApprover: string | null = null
    if (approver_id !== null) {
      if (typeof approver_id !== 'string') {
        return NextResponse.json({ error: 'approver_id 형식이 올바르지 않습니다.' }, { status: 400 })
      }
      if (approver_id === userId) {
        return NextResponse.json({ error: '자기 자신을 결재자로 지정할 수 없습니다.' }, { status: 400 })
      }
      const { data: approverProfile } = await supabase
        .from('cg_profiles')
        .select('id, status')
        .eq('id', approver_id)
        .single()
      if (!approverProfile || approverProfile.status !== 'active') {
        return NextResponse.json({ error: '결재자로 지정할 수 없는 사용자입니다.' }, { status: 400 })
      }
      newApprover = approver_id
    }
    // approver_id 는 authenticated 컬럼 UPDATE 권한이 회수되어 있어(step28) service_role 로 수행.
    // 권한 확인은 위 isAdmin 게이트로 이미 완료.
    const admin = createAdminClient()
    const { error } = await admin
      .from('cg_profiles')
      .update({ approver_id: newApprover })
      .eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2) total_days 변경: 관리자(approver_id=null) 또는 본인이 결재자
  if (total_days !== undefined) {
    // approver_id가 같은 요청에서 새로 지정된 경우 그 값을 기준으로 권한 판정
    const effectiveApproverId =
      approver_id === undefined
        ? target.approver_id
        : (approver_id === null ? null : (approver_id as string))

    const canEditDays =
      (effectiveApproverId == null && isAdmin) ||
      effectiveApproverId === me.id

    if (!canEditDays) {
      return NextResponse.json({ error: '총휴가 일수를 변경할 권한이 없습니다.' }, { status: 403 })
    }

    if (typeof total_days !== 'number' || total_days < 0 || total_days > 365) {
      return NextResponse.json({ error: '유효하지 않은 휴가 일수입니다.' }, { status: 400 })
    }

    const currentYear = new Date().getFullYear()

    const { error } = await supabase
      .from('cg_vacation_allocations')
      .upsert(
        { user_id: userId, year: currentYear, total_days, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,year' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 둘 다 미지정인 경우
  if (approver_id === undefined && total_days === undefined) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
  }

  return NextResponse.json({ success: true, isApproverForTarget })
}
