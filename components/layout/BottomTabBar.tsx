'use client'
import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, FileText, CheckSquare, User, Settings } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import {
  useAdminUsers, useVacationCancelRequests, useVacationRequests, useApproverData, invalidate,
} from '@/lib/hooks/use-shared-data'

const BASE_TABS = [
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/notices',  label: '공지',   icon: FileText },
  { href: '/todo',     label: 'TO-DO',  icon: CheckSquare },
  { href: '/profile',  label: '프로필', icon: User },
]

interface BottomTabBarProps {
  role?: string
  isSuperAdmin?: boolean
  isApprover?: boolean
}

export function BottomTabBar({ role, isSuperAdmin = false, isApprover: isApproverProp }: BottomTabBarProps) {
  const pathname = usePathname()
  // 결재함 노출 여부 — 상위에서 서버사이드로 계산해서 내려준 값을 우선 사용한다.
  // (관리 직원이 0명인 매니저는 결재함을 숨긴다)
  const isApprover = isApproverProp ?? (role === 'manager')

  // SWR — 동일 endpoint 를 다른 컴포넌트도 부르지만 30s 내 1회만 네트워크.
  // isSuperAdmin / isApprover 가 아닌 경우 conditional fetching (key=null) 로 호출 안 함.
  const { data: usersData } = useAdminUsers(isSuperAdmin ? undefined : { revalidateOnMount: false })
  const { data: cancelReqsData } = useVacationCancelRequests(isSuperAdmin ? undefined : { revalidateOnMount: false })
  const { data: vacReqsData } = useVacationRequests(isSuperAdmin ? undefined : { revalidateOnMount: false })
  const { data: approverData } = useApproverData((isApprover && !isSuperAdmin) ? undefined : { revalidateOnMount: false })

  const pendingCount = useMemo(() => {
    if (isSuperAdmin) {
      const pendingUsers = Array.isArray(usersData)
        ? (usersData as any[]).filter(u => u.status === 'pending').length : 0
      const pendingCancel = Array.isArray(cancelReqsData)
        ? (cancelReqsData as any[]).filter(r => r.status === 'pending' && (r.requester?.approver_id ?? null) === null).length : 0
      const pendingVacation = Array.isArray(vacReqsData)
        ? (vacReqsData as any[]).filter(r => r.status === 'pending' && (r.approver_id ?? null) === null).length : 0
      return pendingUsers + pendingCancel + pendingVacation
    }
    if (isApprover) {
      const c = Array.isArray((approverData as any)?.cancel_requests)
        ? (approverData as any).cancel_requests.filter((r: any) => r.status === 'pending').length : 0
      const v = Array.isArray((approverData as any)?.vacation_requests)
        ? (approverData as any).vacation_requests.filter((r: any) => r.status === 'pending').length : 0
      return c + v
    }
    return 0
  }, [isSuperAdmin, isApprover, usersData, cancelReqsData, vacReqsData, approverData])

  // 휴가 취소 요청 / 회원 가입 변경 시 SWR 캐시 무효화
  useEffect(() => {
    if (!isSuperAdmin && !isApprover) return
    const supabase = createClient()
    const channel = supabase
      .channel('bottom-tab-bar-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_cancel_requests' }, () => {
        invalidate.vacationCancel()
        if (isApprover) invalidate.vacationApprover()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_requests' }, () => {
        invalidate.vacationRequests()
        if (isApprover) invalidate.vacationApprover()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cg_profiles' }, () => {
        if (isSuperAdmin) invalidate.adminUsers()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isSuperAdmin, isApprover])

  const tabs = isSuperAdmin
    ? [...BASE_TABS, { href: '/admin', label: '앱관리', icon: Settings }]
    : isApprover
      ? [...BASE_TABS, { href: '/approvals', label: '결재함', icon: Settings }]
      : BASE_TABS

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E7EB] flex dark:bg-[#374151] dark:border-[#4B5563]">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        const showsBadge = href === '/admin' || href === '/approvals'
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors',
              active
                ? 'text-[#2563EB] dark:text-[#60A5FA]'
                : 'text-[#6B7280] dark:text-[#94A3B8]'
            )}
          >
            <span className="relative">
              <Icon className={cn('h-5 w-5', active && 'text-[#2563EB] dark:text-[#60A5FA]')} />
              {showsBadge && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-[#EF4444] text-white text-[9px] font-bold leading-none">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
