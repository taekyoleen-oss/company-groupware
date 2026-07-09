import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// PATCH: 승인/거절/라벨 변경
// body: { action?: 'approve' | 'reject', device_label?: string }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!isSuperAdmin(profile)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  type DeviceUpdate = {
    status?: 'pending' | 'approved' | 'rejected'
    decided_at?: string | null
    decided_by?: string | null
    device_label?: string | null
  }
  const update: DeviceUpdate = {}

  if (body.action === 'approve' || body.action === 'reject') {
    update.status = body.action === 'approve' ? 'approved' : 'rejected'
    update.decided_at = new Date().toISOString()
    update.decided_by = user.id
  }

  if ('device_label' in body) {
    const label = typeof body.device_label === 'string' ? body.device_label.trim() : ''
    update.device_label = label || null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
  }

  // status/decided_* 는 authenticated 컬럼 권한이 회수되어 있어(step28) service_role 로 수행.
  // 권한 확인은 위 isSuperAdmin 게이트로 이미 완료.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cg_office_devices')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: 등록 해제
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!isSuperAdmin(profile)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { error } = await supabase.from('cg_office_devices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
