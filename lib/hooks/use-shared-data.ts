'use client'
// 공용 데이터 hook — 여러 컴포넌트가 같은 endpoint 를 부르는 경우를 SWR 로 일원화.
// 동작·UI 는 변경하지 않는다. 결과 shape 는 기존 fetch 응답과 동일.

import useSWR, { mutate, type SWRConfiguration } from 'swr'
import type { ProfileWithTeam, Team, EventCategory } from '@/types/app'

// ── endpoint key 상수 (mutate 시 동일 key 사용 보장)
export const K = {
  profile: '/api/profiles',
  teams: '/api/admin/teams',
  categories: '/api/admin/categories',
  adminUsers: '/api/admin/users',
  vacationOwn: '/api/vacation',
  vacationCancel: '/api/vacation-cancel-requests',
  vacationRequests: '/api/vacation/requests',
  vacationApprover: '/api/vacation/approver',
  vacationHistory: '/api/vacation-history',
  teamMembers: '/api/teams/members',
  noticesRecent: '/api/notices',
  hrRecord: '/api/hr-records',
  messages: '/api/messages',
  adminSettings: '/api/admin/settings',
  adminOfficeDevices: '/api/admin/office-devices',
  adminOfficeNetworks: '/api/admin/office-networks',
  adminAttendanceHistory: '/api/admin/attendance/history',
} as const

// ── 페이지·사이드바 공통 ───────────────────────────────────
export const useProfile = (config?: SWRConfiguration) =>
  useSWR<ProfileWithTeam>(K.profile, config)

export const useTeams = (config?: SWRConfiguration) =>
  useSWR<Team[]>(K.teams, config)

export const useCategories = (config?: SWRConfiguration) =>
  useSWR<EventCategory[]>(K.categories, config)

export const useAdminUsers = (config?: SWRConfiguration) =>
  useSWR<ProfileWithTeam[]>(K.adminUsers, config)

export const useVacationOwn = (config?: SWRConfiguration) =>
  useSWR(K.vacationOwn, config)

export const useVacationCancelRequests = (config?: SWRConfiguration) =>
  useSWR(K.vacationCancel, config)

export const useVacationRequests = (config?: SWRConfiguration) =>
  useSWR(K.vacationRequests, config)

export const useApproverData = (config?: SWRConfiguration) =>
  useSWR(K.vacationApprover, config)

export const useVacationHistory = (config?: SWRConfiguration) =>
  useSWR(K.vacationHistory, config)

export const useTeamMembers = (config?: SWRConfiguration) =>
  useSWR(K.teamMembers, config)

// ── Realtime / 액션 콜백에서 캐시 무효화 ───────────────────
export const invalidate = {
  profile:           () => mutate(K.profile),
  teams:             () => mutate(K.teams),
  categories:        () => mutate(K.categories),
  adminUsers:        () => mutate(K.adminUsers),
  vacationOwn:       () => mutate(K.vacationOwn),
  vacationCancel:    () => mutate(K.vacationCancel),
  vacationRequests:  () => mutate(K.vacationRequests),
  vacationApprover:  () => mutate(K.vacationApprover),
  vacationHistory:   () => mutate(K.vacationHistory),
  teamMembers:       () => mutate(K.teamMembers),
  noticesRecent:     () => mutate(K.noticesRecent),
  hrRecord:          () => mutate(K.hrRecord),
  messages:          () => mutate(K.messages),
  adminSettings:     () => mutate(K.adminSettings),
  adminOfficeDevices:  () => mutate(K.adminOfficeDevices),
  adminOfficeNetworks: () => mutate(K.adminOfficeNetworks),
  adminAttendanceHistory: () => mutate(K.adminAttendanceHistory),
  // 휴가 결재 1건 처리 → 관련 모든 캐시 한 번에
  vacationFamily: () => {
    mutate(K.vacationCancel)
    mutate(K.vacationRequests)
    mutate(K.vacationApprover)
    mutate(K.vacationHistory)
    mutate(K.adminUsers)
  },
}
