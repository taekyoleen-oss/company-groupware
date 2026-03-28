export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      cg_teams: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string; created_at?: string }
        Update: { id?: string; name?: string; created_at?: string }
        Relationships: []
      }
      cg_profiles: {
        Row: {
          id: string
          full_name: string
          email: string | null
          team_id: string | null
          role: 'admin' | 'manager' | 'member'
          status: 'pending' | 'active' | 'inactive'
          color: string
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          email?: string | null
          team_id?: string | null
          role?: 'admin' | 'manager' | 'member'
          status?: 'pending' | 'active' | 'inactive'
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string | null
          team_id?: string | null
          role?: 'admin' | 'manager' | 'member'
          status?: 'pending' | 'active' | 'inactive'
          color?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_profiles_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'cg_teams'
            referencedColumns: ['id']
          }
        ]
      }
      cg_event_categories: {
        Row: {
          id: string
          name: string
          color: string
          is_default: boolean
          created_by: string | null
        }
        Insert: {
          id?: string
          name: string
          color: string
          is_default?: boolean
          created_by?: string | null
        }
        Update: {
          id?: string
          name?: string
          color?: string
          is_default?: boolean
          created_by?: string | null
        }
        Relationships: []
      }
      cg_events: {
        Row: {
          id: string
          title: string
          description: string | null
          start_at: string
          end_at: string
          is_all_day: boolean
          location: string | null
          visibility: 'company' | 'team' | 'private'
          category_id: string | null
          created_by: string
          team_id: string | null
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          start_at: string
          end_at: string
          is_all_day?: boolean
          location?: string | null
          visibility?: 'company' | 'team' | 'private'
          category_id?: string | null
          created_by: string
          team_id?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          start_at?: string
          end_at?: string
          is_all_day?: boolean
          location?: string | null
          visibility?: 'company' | 'team' | 'private'
          category_id?: string | null
          created_by?: string
          team_id?: string | null
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_events_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_events_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'cg_teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_events_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'cg_event_categories'
            referencedColumns: ['id']
          }
        ]
      }
      cg_notices: {
        Row: {
          id: string
          title: string
          content: string
          visibility: 'company' | 'team'
          team_id: string | null
          is_pinned: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          visibility?: 'company' | 'team'
          team_id?: string | null
          is_pinned?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          visibility?: 'company' | 'team'
          team_id?: string | null
          is_pinned?: boolean
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_notices_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_notices_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'cg_teams'
            referencedColumns: ['id']
          }
        ]
      }
      cg_notice_attachments: {
        Row: {
          id: string
          notice_id: string
          file_name: string
          file_url: string
          file_size: number
          file_type: string
          created_at: string
        }
        Insert: {
          id?: string
          notice_id: string
          file_name: string
          file_url: string
          file_size: number
          file_type: string
          created_at?: string
        }
        Update: {
          id?: string
          notice_id?: string
          file_name?: string
          file_url?: string
          file_size?: number
          file_type?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_notice_attachments_notice_id_fkey'
            columns: ['notice_id']
            isOneToOne: false
            referencedRelation: 'cg_notices'
            referencedColumns: ['id']
          }
        ]
      }
      cg_todos: {
        Row: {
          id: string
          user_id: string
          title: string
          is_done: boolean
          due_date: string | null
          priority: 'high' | 'medium' | 'low'
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          is_done?: boolean
          due_date?: string | null
          priority?: 'high' | 'medium' | 'low'
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          is_done?: boolean
          due_date?: string | null
          priority?: 'high' | 'medium' | 'low'
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_todos_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
