'use client'
/**
 * 전역 Supabase Realtime 단일 채널.
 *
 * 이전: AdminSidebar, ApproverSidebar, BottomTabBar, approvals/page, admin/page,
 *      calendar/page 등이 각자 같은 테이블을 중복 구독 → 이벤트 1건이 5번 fetch 트리거.
 *
 * 지금: layout 에 단 1번 마운트되어 핵심 테이블을 한 채널로 구독.
 *      이벤트가 오면 SWR mutate(key) 만 호출 → 해당 hook 을 쓰는 모든 컴포넌트가
 *      자동 re-render. 같은 endpoint 가 30s 내 한 번만 네트워크 호출됨.
 *
 * UI/동작 변경 없음. 단지 중복 채널·중복 fetch 가 사라질 뿐.
 */
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { invalidate } from '@/lib/hooks/use-shared-data'

interface Props {
  userId: string
  teamId: string | null
  children?: React.ReactNode
}

export function RealtimeProvider({ userId, teamId, children }: Props) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`app-shared-${userId}`)
      // 휴가 취소 신청
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_cancel_requests' }, () => {
        invalidate.vacationCancel()
        invalidate.vacationApprover()
      })
      // 휴가 신청
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_requests' }, () => {
        invalidate.vacationRequests()
        invalidate.vacationApprover()
      })
      // 회원 상태 변경 (가입승인 등)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cg_profiles' }, () => {
        invalidate.adminUsers()
      })
      // 출근 기록 (관리자/결재자 화면에서 사용)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_attendance' }, () => {
        // /api/attendance/* 계열은 날짜 쿼리가 들어가 키가 동적이라
        // 여기서 전체 key 매칭으로 무효화하지 않고, 각 페이지가 자체 useSWR 키로 가입.
        // 일단 admin attendance(history) 만 트리거.
        invalidate.adminAttendanceHistory()
      })
      // 새 메시지(본인 수신) — 알림용
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cg_messages',
        filter: `recipient_id=eq.${userId}`,
      }, () => { invalidate.messages() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // teamId 가 변하면 다시 구독해야 하지만 layout 에서 한 번만 마운트되므로 영향 없음
  }, [userId, teamId])

  return <>{children}</>
}
