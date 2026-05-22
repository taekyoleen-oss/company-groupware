import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: 현재 브라우저(User-Agent)에 해당하는 본인의 등록 디바이스 상태 조회
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userAgent = request.headers.get('user-agent') ?? 'unknown'

  const { data } = await supabase
    .from('cg_office_devices')
    .select('id, device_label, status, requested_at, decided_at, last_ip, last_used_at')
    .eq('user_id', user.id)
    .eq('user_agent', userAgent)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}
