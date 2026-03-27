import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getNotices(
  supabase: Client,
  { tab = 'company', search = '', cursor, limit = 20 }: {
    tab?: 'company' | 'team'; search?: string; cursor?: string; limit?: number
  } = {}
) {
  let query = supabase
    .from('cg_notices')
    .select(`*, author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name), attachments:cg_notice_attachments(*)`, { count: 'exact' })
    .eq('visibility', tab)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (search) query = query.ilike('title', `%${search}%`)
  if (cursor) query = query.lt('created_at', cursor)
  return query
}

export async function getNoticeById(supabase: Client, id: string) {
  return supabase
    .from('cg_notices')
    .select(`*, author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name), attachments:cg_notice_attachments(*)`)
    .eq('id', id)
    .single()
}

export async function getPinnedCount(
  supabase: Client,
  visibility: 'company' | 'team',
  teamId: string | null,
  excludeId?: string
) {
  let query = supabase
    .from('cg_notices')
    .select('id', { count: 'exact', head: true })
    .eq('is_pinned', true)
    .eq('visibility', visibility)
  if (visibility === 'team' && teamId) query = query.eq('team_id', teamId)
  if (excludeId) query = query.neq('id', excludeId)
  return query
}
