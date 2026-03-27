import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getCategories(supabase: Client) {
  return supabase.from('cg_event_categories').select('*').order('name')
}
