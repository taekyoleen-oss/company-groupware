import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  if (!isSuperAdmin(profile)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { error } = await supabase.from('cg_office_networks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  if (!isSuperAdmin(profile)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await request.json()
  const update: { label?: string | null } = {}
  if ('label' in body) update.label = body.label?.toString().trim() || null

  const { data, error } = await supabase
    .from('cg_office_networks')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
