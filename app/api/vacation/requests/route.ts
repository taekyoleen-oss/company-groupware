import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 휴가 신청 목록 (역할별)
//   - 관리자: 전체 (requester.approver_id 함께 반환 → UI에서 본인 결재 분 분기)
//   - 결재자(일반): 본인 결재 직원 건 + 본인 신청 건
//   - 그 외: 본인 신청 건만
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  const isAdmin = (me as any)?.role === 'admin'

  const selectExpr = `
    *,
    requester:cg_profiles!requested_by(id, full_name, color, approver_id),
    approver:cg_profiles!approver_id(id, full_name, color),
    reviewer:cg_profiles!reviewed_by(id, full_name, color)
  `

  if (isAdmin) {
    const { data, error } = await supabase
      .from('cg_vacation_requests')
      .select(selectExpr)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // 일반 사용자: 본인 신청 + 본인이 결재자인 건
  const { data, error } = await supabase
    .from('cg_vacation_requests')
    .select(selectExpr)
    .or(`requested_by.eq.${user.id},approver_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
