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

// HTTP 헤더는 ByteString(0–255)만 허용하므로 한글이 포함된 full_name 등을
// 안전하게 보내려면 UTF-8 → base64 로 인코딩한다. (Edge runtime 호환)
export function encodeProfileHeader(payload: MiddlewareProfilePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function decodeProfileHeader(raw: string): MiddlewareProfilePayload | null {
  try {
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as MiddlewareProfilePayload
  } catch {
    return null
  }
}
