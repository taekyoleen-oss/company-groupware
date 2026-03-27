import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { items } = await request.json() as { items: Array<{ id: string; sort_order: number }> }
  const updates = items.map(item =>
    supabase.from('cg_todos').update({ sort_order: item.sort_order }).eq('id', item.id).eq('user_id', user.id)
  )
  await Promise.all(updates)
  return NextResponse.json({ success: true })
}
