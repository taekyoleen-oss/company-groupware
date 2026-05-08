import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/ip'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: settings } = await supabase
    .from('cg_company_settings')
    .select('office_ips')
    .single()

  const ip = getClientIp(request)
  const allowedIps = (settings?.office_ips ?? '')
    .split(',').map((s: string) => s.trim()).filter(Boolean)

  return NextResponse.json({
    ip,
    allowed: allowedIps.length > 0 && allowedIps.includes(ip),
  })
}
