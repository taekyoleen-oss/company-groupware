import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data: profile } = await supabase.from('cg_profiles').select('role').eq('id', user.id).single()
  const { data: event } = await supabase.from('cg_events').select('created_by').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = event.created_by === user.id
  const isAdmin = profile?.role === 'admin'
  if (!isOwner && !isAdmin) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  const body = await request.json()
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

  const { data: profile } = await supabase.from('cg_profiles').select('role').eq('id', user.id).single()
  const { data: event } = await supabase.from('cg_events').select('created_by').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = event.created_by === user.id
  const isAdmin = profile?.role === 'admin'
  if (!isOwner && !isAdmin) return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })

  const { error } = await supabase.from('cg_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
