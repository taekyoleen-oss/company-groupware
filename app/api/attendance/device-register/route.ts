import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp, ipMatchesCidr } from '@/lib/utils/cidr'

// POST: 직원이 본인 PC 등록을 요청. 사무실 IP에서만 가능.
// body: { device_label?: string }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('status')
    .eq('id', user.id)
    .single()
  if (profile?.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientIp = getClientIp(request)
  if (!clientIp) {
    return NextResponse.json({ error: '클라이언트 IP를 확인할 수 없습니다.' }, { status: 400 })
  }

  // 사무실 IP에서만 등록 요청 가능
  const { data: networks } = await supabase
    .from('cg_office_networks')
    .select('cidr')
  const onOfficeIp = (networks ?? []).some(n => ipMatchesCidr(clientIp, n.cidr))
  if (!onOfficeIp) {
    return NextResponse.json(
      { error: '사무실 네트워크에서만 PC 등록 요청이 가능합니다.', current_ip: clientIp },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const deviceLabel = typeof body.device_label === 'string' ? body.device_label.trim() : ''
  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  // 이미 존재하면 last_ip / label 만 갱신 (status 는 유지)
  const { data: existing } = await supabase
    .from('cg_office_devices')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('user_agent', userAgent)
    .maybeSingle()

  if (existing) {
    type DeviceUpdate = {
      last_ip?: string | null
      device_label?: string | null
      status?: 'pending' | 'approved' | 'rejected'
      requested_at?: string
      decided_at?: string | null
      decided_by?: string | null
    }
    const update: DeviceUpdate = { last_ip: clientIp }
    if (deviceLabel) update.device_label = deviceLabel
    // 거절된 PC를 다시 요청하면 pending 으로 되돌림
    if (existing.status === 'rejected') {
      update.status = 'pending'
      update.requested_at = new Date().toISOString()
      update.decided_at = null
      update.decided_by = null
    }
    const { data, error } = await supabase
      .from('cg_office_devices')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('cg_office_devices')
    .insert({
      user_id: user.id,
      user_agent: userAgent,
      last_ip: clientIp,
      device_label: deviceLabel || null,
      status: 'pending',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
