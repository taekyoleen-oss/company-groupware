import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: me } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  if (!isSuperAdmin(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json()
  // 앱관리자 자기 자신은 is_super_admin 해제 금지 (서비스 락아웃 방지)
  if (id === user.id && body.is_super_admin === false) {
    return NextResponse.json({ error: '본인의 앱관리자 권한은 해제할 수 없습니다.' }, { status: 400 })
  }
  const { data, error } = await supabase.from('cg_profiles').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
