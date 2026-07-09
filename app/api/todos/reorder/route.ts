import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { items?: unknown }
  const items = body.items
  // 입력 검증 — 비배열/잘못된 원소면 400 (이전에는 검증 없이 TypeError 500 유발 가능)
  if (!Array.isArray(items) ||
      !items.every(it => it && typeof (it as any).id === 'string' && Number.isInteger((it as any).sort_order))) {
    return NextResponse.json({ error: '유효하지 않은 정렬 데이터입니다.' }, { status: 400 })
  }

  const updates = (items as Array<{ id: string; sort_order: number }>).map(item =>
    supabase.from('cg_todos').update({ sort_order: item.sort_order }).eq('id', item.id).eq('user_id', user.id)
  )
  const results = await Promise.all(updates)
  // 일부라도 실패하면 성공으로 위장하지 않고 에러 반환 → 클라이언트가 롤백
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
