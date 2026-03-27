import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getTeams(supabase: Client) {
  return supabase.from('cg_teams').select('*').order('name')
}
