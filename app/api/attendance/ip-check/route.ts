import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp, ipMatchesCidr } from '@/lib/utils/cidr'

// GET: 현재 IP가 사무실 네트워크 범위 안인지 + 본인의 디바이스(이 브라우저) 등록 상태 + 회사 정책
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  const [{ data: networks }, { data: settings }, { data: device }] = await Promise.all([
    supabase.from('cg_office_networks').select('cidr'),
    supabase.from('cg_company_settings').select('require_device_approval').maybeSingle(),
    supabase
      .from('cg_office_devices')
      .select('id, status, device_label, requested_at, decided_at')
      .eq('user_id', user.id)
      .eq('user_agent', userAgent)
      .maybeSingle(),
  ])

  const allowed = ip ? (networks ?? []).some(n => ipMatchesCidr(ip, n.cidr)) : false

  return NextResponse.json({
    ip,
    allowed,
    require_device_approval: settings?.require_device_approval ?? false,
    device: device ?? null,
  })
}
