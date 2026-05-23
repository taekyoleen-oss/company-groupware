import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// 인사기록 단건 GET/PUT/DELETE — 앱관리자만
export async function GET(
  _req: NextRequest,
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

  // 앱관리자 또는 본인만 조회 가능
  if (!isSuperAdmin(me) && user.id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('cg_hr_records')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? null)
}

export async function PUT(
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

  if (!isSuperAdmin(me)) {
    return NextResponse.json({ error: '앱관리자만 인사기록을 편집할 수 있습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const allowed = ['hire_date', 'employee_no', 'birth_date', 'phone', 'emergency_contact', 'address', 'notes'] as const
  const payload: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }
  for (const k of allowed) {
    if (k in body) {
      const v = body[k]
      payload[k] = v === '' ? null : v
    }
  }

  const { data, error } = await supabase
    .from('cg_hr_records')
    .upsert(payload as never, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
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

  if (!isSuperAdmin(me)) {
    return NextResponse.json({ error: '앱관리자만 인사기록을 삭제할 수 있습니다.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('cg_hr_records')
    .delete()
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
