import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatEventShare, formatNoticeShare } from '@/lib/utils/kakaoFormat'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')
  if (!type || !id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  if (type === 'event') {
    const { data } = await supabase
      .from('cg_events')
      .select(`*, category:cg_event_categories(name), author:cg_profiles!created_by(full_name)`)
      .eq('id', id)
      .single()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ text: formatEventShare(data as any) })
  }

  if (type === 'notice') {
    const { data } = await supabase
      .from('cg_notices')
      .select(`*, author:cg_profiles!created_by(full_name)`)
      .eq('id', id)
      .single()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ text: formatNoticeShare(data as any) })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
