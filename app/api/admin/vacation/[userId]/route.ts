import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH: 휴가 관련 직원 속성 변경
//   - total_days: 관리자(본인이 결재) 또는 본인이 결재자인 결재자
//   - approver_id: 관리자만
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
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const isAdmin = me.role === 'admin'

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

  // 1) approver_id 변경: 관리자만
  if (approver_id !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: '결재자 지정은 관리자만 가능합니다.' }, { status: 403 })
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
    const { error } = await supabase
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
