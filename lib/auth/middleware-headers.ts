// middleware → layout 간 프로필 정보 전달용 상수.
// middleware.ts 와 layout.tsx 양쪽에서 공유.

export const CG_PROFILE_HEADER = 'x-cg-profile'

export interface MiddlewareProfilePayload {
  id: string
  full_name: string
  color: string
  team_id: string | null
  role: 'admin' | 'manager' | 'member'
  is_super_admin: boolean | null
  status: 'pending' | 'active' | 'inactive'
  approver_scope_count: number
}
