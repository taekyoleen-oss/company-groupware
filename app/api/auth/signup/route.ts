import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function POST(request: NextRequest) {
  const { email, password, fullName } = await request.json()

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
  }

  const supabase = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 첫 번째 사용자인지 확인 (= Admin)
  const { count } = await supabase
    .from('cg_profiles')
    .select('id', { count: 'exact', head: true })

  const isFirstUser = (count ?? 0) === 0

  // Auth 사용자 생성 (이메일 확인 없이 즉시 활성화)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    if (authError?.message?.includes('already registered')) {
      return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 400 })
    }
    return NextResponse.json({ error: authError?.message ?? '회원가입에 실패했습니다.' }, { status: 500 })
  }

  // 색상 팔레트
  const palette = [
    '#EF4444', '#F97316', '#EAB308', '#22C55E',
    '#10B981', '#14B8A6', '#3B82F6', '#6366F1',
    '#8B5CF6', '#EC4899', '#F43F5E', '#64748B',
  ]
  const color = palette[(count ?? 0) % palette.length]

  // 프로필 생성 (service role → RLS 우회)
  const { error: profileError } = await supabase.from('cg_profiles').insert({
    id: authData.user.id,
    full_name: fullName,
    color,
    role: isFirstUser ? 'admin' : 'member',
    status: isFirstUser ? 'active' : 'pending',
  })

  if (profileError) {
    // 프로필 실패 시 auth 사용자도 제거
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: '프로필 생성에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ isAdmin: isFirstUser }, { status: 201 })
}
