import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { total_days } = body

  if (typeof total_days !== 'number' || total_days < 0 || total_days > 365) {
    return NextResponse.json({ error: '유효하지 않은 휴가 일수입니다.' }, { status: 400 })
  }

  const currentYear = new Date().getFullYear()

  const { error } = await supabase
    .from('cg_vacation_allocations')
    .upsert(
      { user_id: userId, year: currentYear, total_days, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,year' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
