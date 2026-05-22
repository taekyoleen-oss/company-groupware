import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

// GET: 등록된 모든 PC 목록 (사용자 프로필 조인)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()
  if (!isSuperAdmin(profile)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('cg_office_devices')
    .select(`
      id, user_id, user_agent, last_ip, device_label, status,
      requested_at, decided_at, last_used_at,
      user:cg_profiles!cg_office_devices_user_id_fkey ( id, full_name, color ),
      decider:cg_profiles!cg_office_devices_decided_by_fkey ( id, full_name )
    `)
    .order('requested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
