import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getProfile(supabase: Client, id: string) {
  return supabase
    .from('cg_profiles')
    .select(`*, team:cg_teams(id,name)`)
    .eq('id', id)
    .single()
}

export async function getAllProfiles(supabase: Client) {
  return supabase
    .from('cg_profiles')
    .select(`*, team:cg_teams(id,name)`)
    .order('created_at')
}

export async function countActiveProfiles(supabase: Client) {
  return supabase
    .from('cg_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
}
