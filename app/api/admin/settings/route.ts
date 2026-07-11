import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('cg_company_settings')
    .select('*')
    .single()

  return NextResponse.json(
    data ?? {
      address: '',
      latitude: null,
      longitude: null,
      radius_meters: 200,
      attendance_method: 'ip',
      office_ips: null,
      require_device_approval: false,
    }
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!isSuperAdmin(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    address,
    latitude,
    longitude,
    radius_meters,
    attendance_method,
    office_ips,
    require_device_approval,
    vacation_proxy_user_id,
  } = body

  const { data: existing } = await supabase
    .from('cg_company_settings')
    .select('id')
    .single()

  const payload = {
    address,
    latitude,
    longitude,
    radius_meters,
    attendance_method,
    office_ips,
    require_device_approval,
    vacation_proxy_user_id: vacation_proxy_user_id ?? null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await supabase
      .from('cg_company_settings')
      .update(payload)
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('cg_company_settings').insert(payload)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
