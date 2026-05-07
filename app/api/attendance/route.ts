import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  // 클라이언트가 로컬 날짜(YYYY-MM-DD)를 전달 — 서버 UTC 기준과 분리
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const { data } = await supabase
    .from('cg_attendance')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .single()

  return NextResponse.json(data ?? null)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  // 클라이언트 로컬 날짜 사용 (KST 등 시차 보정)
  const { date } = body
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('cg_attendance')
    .select('id, checked_in_at')
    .eq('user_id', user.id)
    .eq('date', date)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: '이미 출석 확인이 완료되었습니다.', checked_in_at: existing.checked_in_at },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('cg_attendance')
    .insert({ user_id: user.id, date, checked_in_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
