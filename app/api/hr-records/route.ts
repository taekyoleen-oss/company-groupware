import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'
import { maskResidentId } from '@/lib/auth/hr-mask'

// GET: 본인의 인사기록 (없으면 null)
// - 주민등록번호는 마스킹된 값만 노출 (평문 resident_id 는 절대 반환하지 않음)
// - 인사관리 메모(notes)는 앱관리자에게만 노출 (일반 회원·관리자에게는 본인 메모도 비표시)
// resident_id / notes 는 authenticated 역할에게 컬럼 단위로 SELECT 가 회수되어 있으므로(step28),
// 이 두 값을 읽으려면 service_role 클라이언트를 사용한다. 접근 대상은 항상 본인 행으로 제한.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('id, role, is_super_admin')
    .eq('id', user.id)
    .single()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cg_hr_records')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json(null)

  const { resident_id, notes, ...rest } = data as Record<string, unknown> & {
    resident_id?: string | null
    notes?: string | null
  }

  return NextResponse.json({
    ...rest,
    resident_id_masked: maskResidentId(typeof resident_id === 'string' ? resident_id : null),
    // 앱관리자 본인만 메모 확인 가능
    ...(isSuperAdmin(me) ? { notes: notes ?? null } : {}),
  })
}
