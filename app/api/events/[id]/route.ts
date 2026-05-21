import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name)`)
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

  const { data: profile } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  const { data: event } = await supabase.from('cg_events').select('created_by, is_vacation').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = event.created_by === user.id
  const isAdmin = isSuperAdmin(profile)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  // 휴가 이벤트는 수정 불가 (Admin 포함 — 취소 신청으로만 처리)
  const body = await request.json()
  if (event.is_vacation && !body._allow_vacation_patch) {
    return NextResponse.json({ error: '확정된 휴가는 수정할 수 없습니다. 취소 신청을 이용해 주세요.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('cg_events')
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

  const { data: profile } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  const { data: event } = await supabase.from('cg_events').select('created_by').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = event.created_by === user.id
  const isAdmin = isSuperAdmin(profile)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })

  const { error } = await supabase.from('cg_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
