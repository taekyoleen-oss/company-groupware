// 역할 판정 유틸
//  - 앱관리자(super admin): 전체 시스템(회원/팀/카테고리/휴가일수/사무실 설정)을 관리하고,
//    role='admin' 직원의 휴가/취소도 결재.
//  - 관리자(manager / approver): 본인이 결재자로 지정된 직원의 휴가/취소만 결재.
//  - 실무자(member): 일반 직원.
//
// DB 상의 실제 구분:
//   role='admin' + is_super_admin=true  → 앱관리자
//   role='manager'                       → 관리자(결재자)
//   role='member'                        → 실무자
//
// 단, is_super_admin 컬럼 없이 role='admin'만 있는 레거시 상황도 안전하게 처리한다.

export type UserRoleProfile = {
  role: 'admin' | 'manager' | 'member'
  is_super_admin?: boolean | null
}

/** 앱관리자(전체 관리) 여부 */
export function isSuperAdmin(profile: UserRoleProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.is_super_admin === true) return true
  // 마이그레이션 적용 전 fallback: is_super_admin 컬럼이 없거나 false 인데
  // role='admin' 인 경우 → 일단 앱관리자로 본다.
  if (profile.is_super_admin == null && profile.role === 'admin') return true
  return false
}

/** 결재자(관리자) 여부 — 앱관리자도 결재 가능 */
export function isApprover(profile: UserRoleProfile | null | undefined): boolean {
  if (!profile) return false
  if (isSuperAdmin(profile)) return true
  return profile.role === 'manager'
}

/** 결재 권한 표시용 라벨 */
export function roleLabel(profile: UserRoleProfile | null | undefined): '앱관리자' | '관리자' | '실무자' | '' {
  if (!profile) return ''
  if (isSuperAdmin(profile)) return '앱관리자'
  if (profile.role === 'manager') return '관리자'
  if (profile.role === 'member') return '실무자'
  return ''
}
