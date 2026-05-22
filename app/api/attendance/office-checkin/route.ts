import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp, ipMatchesCidr } from '@/lib/utils/cidr'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 활성 사용자 확인
  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('status')
    .eq('id', user.id)
    .single()
  if (profile?.status !== 'active') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const clientIp = getClientIp(request)
  if (!clientIp) return NextResponse.json({ matched: false, ip: null })

  // 등록된 사무실 IP 목록 조회
  const { data: networks } = await supabase
    .from('cg_office_networks')
    .select('id, cidr')

  const matched = (networks ?? []).find(n => ipMatchesCidr(clientIp, n.cidr))
  if (!matched) return NextResponse.json({ matched: false, ip: clientIp })

  // 승인 필수 모드 — 미승인 PC는 자동 출근 처리 안 함
  const { data: settings } = await supabase
    .from('cg_company_settings')
    .select('require_device_approval')
    .maybeSingle()

  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  if (settings?.require_device_approval) {
    const { data: device } = await supabase
      .from('cg_office_devices')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('user_agent', userAgent)
      .maybeSingle()

    if (!device || device.status !== 'approved') {
      return NextResponse.json({
        matched: true,
        ip: clientIp,
        skipped: 'device_not_approved',
        device_status: device?.status ?? 'unregistered',
      })
    }

    // last_used_at 갱신 (best-effort)
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

  // KST 오늘 날짜 (UTC+9)
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)

  // 이미 출근했으면 무시 (ON CONFLICT DO NOTHING 대신 수동 확인)
  const { data: existing } = await supabase
    .from('cg_attendance')
    .select('id')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  if (!existing) {
    await supabase.from('cg_attendance').insert({
      user_id: user.id,
      date: today,
      checked_in_at: new Date().toISOString(),
      method: 'office_login',
    })
  }

  return NextResponse.json({ matched: true, ip: clientIp })
}
