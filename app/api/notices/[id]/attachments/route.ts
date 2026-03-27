import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notice_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check attachment count
  const { count } = await supabase
    .from('cg_notice_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('notice_id', notice_id)
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: '첨부파일은 최대 3개까지 가능합니다.' }, { status: 400 })
  }

  const body = await request.json()
  const { data, error } = await supabase
    .from('cg_notice_attachments')
    .insert({ notice_id, ...body })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
