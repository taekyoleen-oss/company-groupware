import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/ip'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  // 클라이언트가 로컬 날짜(YYYY-MM-DD)를 전달 — 서버 UTC 기준과 분리
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const { data } = await supabase
    .from('cg_attendance')
    .select('id, user_id, date, checked_in_at, method')
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
  const { date } = body
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { data: settings } = await supabase
    .from('cg_company_settings')
    .select('attendance_method, office_ips')
    .single()

  if (settings?.attendance_method === 'ip') {
    const ip = getClientIp(request)
    const allowedIps = (settings.office_ips ?? '')
      .split(',').map((s: string) => s.trim()).filter(Boolean)
    if (!allowedIps.includes(ip)) {
      return NextResponse.json({ error: '사무실 네트워크에서만 출석 체크가 가능합니다.' }, { status: 403 })
    }
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
