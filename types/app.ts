import type { Database } from './database'

export type Team = Database['public']['Tables']['cg_teams']['Row']
export type Profile = Database['public']['Tables']['cg_profiles']['Row']
export type EventCategory = Database['public']['Tables']['cg_event_categories']['Row']
export type Event = Database['public']['Tables']['cg_events']['Row']
export type Notice = Database['public']['Tables']['cg_notices']['Row']
export type NoticeAttachment = Database['public']['Tables']['cg_notice_attachments']['Row']
export type Todo = Database['public']['Tables']['cg_todos']['Row']

export type UserRole = 'admin' | 'manager' | 'member'
export type UserStatus = 'pending' | 'active' | 'inactive'
export type EventVisibility = 'company' | 'team' | 'private'
export type NoticeVisibility = 'company' | 'team'
export type Priority = 'high' | 'medium' | 'low'

export interface ProfileWithTeam extends Profile {
  team: Team | null
}

export interface EventWithDetails extends Event {
  category: EventCategory | null
  author: Profile
}

export interface NoticeWithDetails extends Notice {
  author: Profile
  team: Team | null
  attachments: NoticeAttachment[]
}

export interface TodoWithOrder extends Todo {
  sort_order: number
}

// Color palette
export const USER_COLOR_PALETTE = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#10B981', '#14B8A6', '#3B82F6', '#6366F1',
  '#8B5CF6', '#EC4899', '#F43F5E', '#64748B',
] as const

export type UserColor = typeof USER_COLOR_PALETTE[number]
