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
    .select('cidr')

  const matched = (networks ?? []).some(n => ipMatchesCidr(clientIp, n.cidr))
  if (!matched) return NextResponse.json({ matched: false, ip: clientIp })

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
