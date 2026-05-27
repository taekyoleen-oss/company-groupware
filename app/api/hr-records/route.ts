import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { maskResidentId } from '@/lib/auth/hr-mask'

// GET: 본인의 인사기록 (없으면 null) — 주민등록번호는 마스킹된 값만 노출
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cg_hr_records')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json(null)

  const { resident_id, ...rest } = data as Record<string, unknown> & { resident_id?: string | null }
  return NextResponse.json({
    ...rest,
    resident_id_masked: maskResidentId(typeof resident_id === 'string' ? resident_id : null),
  })
}
