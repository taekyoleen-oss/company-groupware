import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cg_notices')
    .select(`*, author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name), attachments:cg_notice_attachments(*)`)
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  if (body.is_pinned !== undefined) {
    const { data: profile } = await supabase.from('cg_profiles').select('role').eq('id', user.id).single()
    if (!['manager', 'admin'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }
    if (body.is_pinned === true) {
      const { data: notice } = await supabase.from('cg_notices').select('visibility, team_id').eq('id', id).single()
      const { count } = await supabase
        .from('cg_notices')
        .select('id', { count: 'exact', head: true })
        .eq('is_pinned', true)
        .eq('visibility', notice?.visibility ?? 'company')
        .neq('id', id)
      if ((count ?? 0) >= 3) {
        return NextResponse.json({ error: '핀 고정은 최대 3개까지 가능합니다.' }, { status: 400 })
      }
    }
  }

  const { data, error } = await supabase
    .from('cg_notices')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabase.from('cg_notices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
