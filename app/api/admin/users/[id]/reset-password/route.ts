import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// 초기화 시 적용되는 고정 비밀번호.
// auth.admin.updateUserById 는 비밀번호 필드만 직접 갱신하며 이메일을 발송하지 않는다.
// (이메일 발송은 inviteUserByEmail / resetPasswordForEmail / generateLink 등에서만 발생)
const RESET_PASSWORD = 'password'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!isSuperAdmin(me)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (id === user.id) {
    return NextResponse.json(
      { error: '본인 비밀번호는 프로필 화면에서 직접 변경해 주세요.' },
      { status: 400 },
    )
  }

  const { data: target, error: targetErr } = await supabase
    .from('cg_profiles')
    .select('id, full_name')
    .eq('id', id)
    .single()
  if (targetErr || !target) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  }

  const adminClient = createAdminClient()
  const { error: updateError } = await adminClient.auth.admin.updateUserById(id, {
    password: RESET_PASSWORD,
  })
  if (updateError) {
    return NextResponse.json(
      { error: '비밀번호 초기화에 실패했습니다.', detail: updateError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    user: { id: target.id, full_name: target.full_name },
  })
}
