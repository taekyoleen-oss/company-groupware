import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/cidr'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!isSuperAdmin(profile)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const ip = getClientIp(request)
  return NextResponse.json({ ip })
}
