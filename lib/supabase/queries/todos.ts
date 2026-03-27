import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getTodos(supabase: Client) {
  return supabase
    .from('cg_todos')
    .select('*')
    .order('is_done')
    .order('sort_order')
}
