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

  const allowed = ['hire_date', 'hire_position', 'resident_id', 'phone', 'emergency_contact', 'address', 'notes'] as const
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

  // 학력/경력/자격증 — string[] 한 줄 자유입력, 빈 문자열 제거 후 상한 적용
  const listLimits = { education: 3, career: 5, certificates: 5 } as const
  for (const [key, limit] of Object.entries(listLimits)) {
    if (key in body) {
      const raw = body[key]
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: `${key}는 배열이어야 합니다.` }, { status: 400 })
      }
      const cleaned = raw
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(v => v.length > 0)
        .slice(0, limit)
      payload[key] = cleaned
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
