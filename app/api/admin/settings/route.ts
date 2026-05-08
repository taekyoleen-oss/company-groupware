import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('cg_company_settings')
    .select('*')
    .single()

  return NextResponse.json(
    data ?? { address: '', latitude: null, longitude: null, radius_meters: 200, attendance_method: 'gps', office_ips: null }
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { address, latitude, longitude, radius_meters, attendance_method, office_ips } = body

  const { data: existing } = await supabase
    .from('cg_company_settings')
    .select('id')
    .single()

  if (existing) {
    const { error } = await supabase
      .from('cg_company_settings')
      .update({ address, latitude, longitude, radius_meters, attendance_method, office_ips, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('cg_company_settings')
      .insert({ address, latitude, longitude, radius_meters, attendance_method, office_ips })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
