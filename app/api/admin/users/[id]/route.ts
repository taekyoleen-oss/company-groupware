import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  if (!isSuperAdmin(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  // 앱관리자만 변경 가능한 컬럼 화이트리스트 (임의 컬럼 mass-assignment 방지)
  const patch: Record<string, unknown> = {}
  if (typeof body.role === 'string') patch.role = body.role
  if (typeof body.is_super_admin === 'boolean') patch.is_super_admin = body.is_super_admin
  if (typeof body.status === 'string') patch.status = body.status
  if (typeof body.full_name === 'string') patch.full_name = body.full_name
  if (typeof body.color === 'string') patch.color = body.color
  if (body.team_id === null || typeof body.team_id === 'string') patch.team_id = body.team_id
  if (body.approver_id === null || typeof body.approver_id === 'string') patch.approver_id = body.approver_id

  // 앱관리자 자기 자신은 is_super_admin 해제 금지 (서비스 락아웃 방지)
  if (id === user.id && patch.is_super_admin === false) {
    return NextResponse.json({ error: '본인의 앱관리자 권한은 해제할 수 없습니다.' }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
  }

  // role/is_super_admin/status/approver_id 는 authenticated 컬럼 UPDATE 권한이 회수되어 있어(step28)
  // service_role 로 수행한다. 권한 확인은 위 isSuperAdmin 게이트로 이미 완료.
  const admin = createAdminClient()
  const { data, error } = await admin.from('cg_profiles').update(patch as never).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
