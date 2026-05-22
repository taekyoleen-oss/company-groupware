import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp, ipMatchesCidr } from '@/lib/utils/cidr'

// KST(UTC+9) 기준 오늘 날짜 — 클라이언트가 date 를 안 보낼 때의 안전한 기본값
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  // 클라이언트가 로컬 날짜(YYYY-MM-DD)를 전달 — 없으면 KST 기준 오늘
  const date = searchParams.get('date') ?? kstToday()

  // method 컬럼이 DB에 아직 없는 환경 호환 — '*' 와일드카드로 조회
  const { data, error } = await supabase
    .from('cg_attendance')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  if (error) {
    console.error('[attendance GET] select error:', error.message, { date, user_id: user.id })
    return NextResponse.json(null)
  }
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
    .maybeSingle()

  const clientIp = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  // GPS 출근은 더 이상 사용하지 않음. 기본을 IP 매칭으로 간주하되, 명시적으로 'gps' 설정인 경우만 IP 체크 스킵.
  const isIpMode = settings?.attendance_method !== 'gps'

  if (isIpMode) {
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

  // 기존 출근 기록 확인 (멱등) — 같은 user + 같은 날짜는 한 번만 허용
  const { data: existing, error: selectError } = await supabase
    .from('cg_attendance')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()

  if (selectError) {
    console.error('[attendance POST] existing select error:', selectError.message, { date, user_id: user.id })
  }

  if (existing) {
    // 이미 있으면 200 으로 기존 row 를 그대로 반환 — 프론트가 동일한 success 흐름으로 처리할 수 있게
    return NextResponse.json(existing, { status: 200 })
  }

  // 출근 방식 결정: 사무실 IP 매칭 — 'office_login', GPS 모드 — 'gps'
  // method 컬럼이 DB 에 없는 환경에서도 동작하도록 try → fallback
  const method = isIpMode ? 'office_login' : 'gps'

  let insertPayload: Record<string, unknown> = {
    user_id: user.id,
    date,
    checked_in_at: new Date().toISOString(),
    method,
  }

  let { data, error } = await supabase
    .from('cg_attendance')
    .insert(insertPayload as never)
    .select('*')
    .single()

  // method 컬럼이 아직 없다는 에러면 빼고 재시도
  if (error && /method/.test(error.message)) {
    console.warn('[attendance POST] retry without method column:', error.message)
    insertPayload = { user_id: user.id, date, checked_in_at: insertPayload.checked_in_at }
    const retry = await supabase
      .from('cg_attendance')
      .insert(insertPayload as never)
      .select('*')
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[attendance POST] insert error:', error.message, { date, user_id: user.id, method })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
