export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      cg_teams: {
        Row: { id: string; name: string; abbreviation: string | null; sort_order: number; created_at: string }
        Insert: { id?: string; name: string; abbreviation?: string | null; sort_order?: number; created_at?: string }
        Update: { id?: string; name?: string; abbreviation?: string | null; sort_order?: number; created_at?: string }
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
          approver_id: string | null
          is_super_admin: boolean
          is_hidden: boolean
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
          approver_id?: string | null
          is_super_admin?: boolean
          is_hidden?: boolean
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
          approver_id?: string | null
          is_super_admin?: boolean
          is_hidden?: boolean
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
          is_vacation: boolean
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
          is_vacation?: boolean
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
          is_vacation?: boolean
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
      cg_vacation_cancel_requests: {
        Row: {
          id: string
          event_id: string | null
          requested_by: string
          status: 'pending' | 'approved' | 'rejected'
          reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          event_title: string | null
          event_start_at: string | null
          event_end_at: string | null
          event_is_all_day: boolean | null
        }
        Insert: {
          id?: string
          event_id?: string | null
          requested_by: string
          status?: 'pending' | 'approved' | 'rejected'
          reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          event_title?: string | null
          event_start_at?: string | null
          event_end_at?: string | null
          event_is_all_day?: boolean | null
        }
        Update: {
          id?: string
          event_id?: string | null
          requested_by?: string
          status?: 'pending' | 'approved' | 'rejected'
          reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          event_title?: string | null
          event_start_at?: string | null
          event_end_at?: string | null
          event_is_all_day?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: 'cg_vacation_cancel_requests_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'cg_events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_vacation_cancel_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          }
        ]
      }
      cg_vacation_requests: {
        Row: {
          id: string
          requested_by: string
          approver_id: string | null
          title: string
          description: string | null
          start_at: string
          end_at: string
          is_all_day: boolean
          status: 'pending' | 'approved' | 'rejected'
          event_id: string | null
          reject_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          requested_by: string
          approver_id?: string | null
          title: string
          description?: string | null
          start_at: string
          end_at: string
          is_all_day?: boolean
          status?: 'pending' | 'approved' | 'rejected'
          event_id?: string | null
          reject_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          requested_by?: string
          approver_id?: string | null
          title?: string
          description?: string | null
          start_at?: string
          end_at?: string
          is_all_day?: boolean
          status?: 'pending' | 'approved' | 'rejected'
          event_id?: string | null
          reject_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_vacation_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_vacation_requests_approver_id_fkey'
            columns: ['approver_id']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_vacation_requests_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'cg_events'
            referencedColumns: ['id']
          }
        ]
      }
      cg_vacation_allocations: {
        Row: {
          id: string
          user_id: string
          year: number
          total_days: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          year: number
          total_days?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          year?: number
          total_days?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_vacation_allocations_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          }
        ]
      }
      cg_company_settings: {
        Row: {
          id: string
          address: string
          latitude: number | null
          longitude: number | null
          radius_meters: number
          attendance_method: 'gps' | 'ip'
          office_ips: string | null
          require_device_approval: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          address?: string
          latitude?: number | null
          longitude?: number | null
          radius_meters?: number
          attendance_method?: 'gps' | 'ip'
          office_ips?: string | null
          require_device_approval?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          address?: string
          latitude?: number | null
          longitude?: number | null
          radius_meters?: number
          attendance_method?: 'gps' | 'ip'
          office_ips?: string | null
          require_device_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cg_office_devices: {
        Row: {
          id: string
          user_id: string
          user_agent: string
          last_ip: string | null
          device_label: string | null
          status: 'pending' | 'approved' | 'rejected'
          requested_at: string
          decided_at: string | null
          decided_by: string | null
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          user_agent: string
          last_ip?: string | null
          device_label?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          requested_at?: string
          decided_at?: string | null
          decided_by?: string | null
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          user_agent?: string
          last_ip?: string | null
          device_label?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          requested_at?: string
          decided_at?: string | null
          decided_by?: string | null
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cg_office_devices_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cg_office_devices_decided_by_fkey'
            columns: ['decided_by']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          }
        ]
      }
      cg_office_networks: {
        Row: {
          id: string
          cidr: string
          label: string | null
          last_matched_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cidr: string
          label?: string | null
          last_matched_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cidr?: string
          label?: string | null
          last_matched_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cg_office_networks_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'cg_profiles'
            referencedColumns: ['id']
          }
        ]
      }
      cg_attendance: {
        Row: {
          id: string
          user_id: string
          date: string
          checked_in_at: string
          method: 'gps' | 'office_login'
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          checked_in_at?: string
          method?: 'gps' | 'office_login'
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          checked_in_at?: string
          method?: 'gps' | 'office_login'
        }
        Relationships: [
          {
            foreignKeyName: 'cg_attendance_user_id_fkey'
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
