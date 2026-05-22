import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// POST { order: string[] } — 팀 ID 배열을 원하는 순서로 받아 sort_order 를 10,20,30,...으로 재부여
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!isSuperAdmin(me)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const order: unknown = body.order
  if (!Array.isArray(order) || order.some(v => typeof v !== 'string')) {
    return NextResponse.json({ error: 'order 는 팀 id 문자열 배열이어야 합니다.' }, { status: 400 })
  }

  // 일괄 업데이트 — Promise.all 로 병렬 실행
  const updates = (order as string[]).map((id, idx) =>
    supabase.from('cg_teams').update({ sort_order: (idx + 1) * 10 }).eq('id', id)
  )
  const results = await Promise.all(updates)
  const firstError = results.find(r => r.error)
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 })

  return NextResponse.json({ success: true, count: order.length })
}
