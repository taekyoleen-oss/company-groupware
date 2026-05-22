import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp, ipMatchesCidr } from '@/lib/utils/cidr'

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
    .select('attendance_method, require_device_approval')
    .single()

  const clientIp = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  if (settings?.attendance_method === 'ip') {
    const { data: networks } = await supabase
      .from('cg_office_networks')
      .select('id, cidr')

    const matched = clientIp
      ? (networks ?? []).find(n => ipMatchesCidr(clientIp, n.cidr))
      : null

    if (!matched) {
      return NextResponse.json(
        { error: '사무실 네트워크에서만 출근 체크가 가능합니다.', current_ip: clientIp },
        { status: 403 }
      )
    }

    // 승인 필수 모드: 이 PC(브라우저)가 approved 인지 확인
    if (settings?.require_device_approval) {
      const { data: device } = await supabase
        .from('cg_office_devices')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('user_agent', userAgent)
        .maybeSingle()

      if (!device || device.status !== 'approved') {
        return NextResponse.json(
          {
            error: device
              ? (device.status === 'pending'
                  ? '이 PC는 아직 관리자 승인 대기 중입니다.'
                  : '이 PC는 등록이 거부되었습니다.')
              : '이 PC는 등록되어 있지 않습니다. 먼저 PC 등록을 요청하세요.',
            device_status: device?.status ?? 'unregistered',
          },
          { status: 403 }
        )
      }

      // 승인된 디바이스 — last_used_at 갱신 (best-effort)
      await supabase
        .from('cg_office_devices')
        .update({ last_used_at: new Date().toISOString(), last_ip: clientIp })
        .eq('id', device.id)
    }

    // 매칭된 네트워크의 최근 매칭 일시 갱신 (best-effort)
    await supabase
      .from('cg_office_networks')
      .update({ last_matched_at: new Date().toISOString() })
      .eq('id', matched.id)
  }

  const { data: existing } = await supabase
    .from('cg_attendance')
    .select('id, checked_in_at')
    .eq('user_id', user.id)
    .eq('date', date)
    .single()

  if (existing) {
    return NextResponse.json(
      { error: '이미 출근 확인이 완료되었습니다.', checked_in_at: existing.checked_in_at },
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
