import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getEvents(
  supabase: Client,
  { start, end }: { start?: string; end?: string } = {}
) {
  let query = supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color)`)
    .order('start_at')
  if (start) query = query.gte('start_at', start)
  if (end) query = query.lte('end_at', end)
  return query
}

export async function getEventById(supabase: Client, id: string) {
  return supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color,team_id), team:cg_teams(id,name)`)
    .eq('id', id)
    .single()
}

export async function getUpcomingPublicEvents(supabase: Client, limit = 3) {
  return supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color)`)
    .in('visibility', ['company', 'team'])
    .gte('start_at', new Date().toISOString())
    .order('start_at')
    .limit(limit)
}
