'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, MessageSquare, Sun, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Notification {
  id: string
  sender_name: string
  content: string
  is_team: boolean
}

interface VacApprovedPopup {
  id: string
  message: string
}

interface MessageNotificationProps {
  userId: string
  teamId: string | null
}

const AUTO_DISMISS_MS = 10_000 // 10초 후 자동 닫힘 (토스트 전용)

export function MessageNotification({ userId, teamId }: MessageNotificationProps) {
  const [items, setItems] = useState<Notification[]>([])
  const [vacApproved, setVacApproved] = useState<VacApprovedPopup | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setItems(prev => prev.filter(n => n.id !== id))
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // 서버측 filter 로 '나에게 온' / '내 팀' 메시지만 구독 → Realtime 이 전체 INSERT 를
    // 구독자마다 RLS 인가 검사하던 비용을 줄인다(무필터 구독 제거).
    const handleInsert = (payload: { new: unknown }) => {
      const msg = payload.new as any
      // 내가 보낸 메시지는 팝업 생략
      if (msg.sender_id === userId) return

      // 휴가 취소 승인 → 모달 팝업 (토스트 대신)
      if (typeof msg.content === 'string' && msg.content.startsWith('[휴가 취소 승인]')) {
        setVacApproved({
          id: msg.id,
          message: msg.content.replace(/^\[휴가 취소 승인\]\s*/, '').trim(),
        })
        return
      }

      // 그 외(거부 포함) → 토스트
      const notification: Notification = {
        id:          msg.id,
        sender_name: msg.sender_name,
        content:     msg.content,
        is_team:     !!msg.team_id,
      }

      setItems(prev => [...prev.slice(-4), notification])
      timers.current[msg.id] = setTimeout(() => dismiss(msg.id), AUTO_DISMISS_MS)
    }

    let channel = supabase
      .channel('cg-messages-notify')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'cg_messages',
        filter: `recipient_id=eq.${userId}`,
      }, handleInsert)

    // 팀 메시지(recipient 없이 team_id 로 발송)도 구독 — 팀이 있을 때만
    if (teamId) {
      channel = channel.on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'cg_messages',
        filter: `team_id=eq.${teamId}`,
      }, handleInsert)
    }

    channel.subscribe()

    const timersAtMount = timers.current
    return () => {
      supabase.removeChannel(channel)
      Object.values(timersAtMount).forEach(clearTimeout)
    }
  }, [userId, teamId, dismiss])

  // 휴가 취소 완료 팝업 확인 → 화면 새로고침 (캘린더에서 휴가 일정 제거됨)
  const handleVacApprovedConfirm = () => {
    setVacApproved(null)
    window.location.reload()
  }

  return (
    <>
      {/* 일반 메시지 + 휴가 취소 거부 토스트 */}
      {items.length > 0 && (
        <div className="fixed top-16 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: '20rem' }}>
          {items.map(item => {
            const isVacRejected = item.content.startsWith('[휴가 취소 거부]')

            const iconBg     = isVacRejected ? '#EF4444' : '#2563EB'
            const borderColor = isVacRejected ? '#FECACA' : '#E5E7EB'
            const bgColor    = isVacRejected ? '#FEF2F2' : '#FFFFFF'

            return (
              <div
                key={item.id}
                className="rounded-xl shadow-lg p-3.5 flex items-start gap-3 border"
                style={{ backgroundColor: bgColor, borderColor }}
              >
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: iconBg }}>
                  {isVacRejected
                    ? <XCircle className="h-4 w-4 text-white" />
                    : <MessageSquare className="h-4 w-4 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  {isVacRejected ? (
                    <p className="text-xs font-semibold" style={{ color: '#991B1B' }}>휴가 취소 거부</p>
                  ) : (
                    <p className="text-xs font-semibold text-[#111827] flex items-center gap-1">
                      {item.sender_name}
                      {item.is_team && (
                        <span className="text-[10px] text-[#6B7280] font-normal bg-[#F3F4F6] px-1.5 py-0.5 rounded">팀</span>
                      )}
                    </p>
                  )}
                  <p className="text-xs mt-0.5 whitespace-pre-wrap break-words line-clamp-4" style={{ color: isVacRejected ? '#7F1D1D' : '#374151' }}>
                    {isVacRejected
                      ? item.content.replace(/^\[휴가 취소 거부\]\s*/, '')
                      : item.content}
                  </p>
                  <p className="text-[10px] text-[#9CA3AF] mt-1">10초 후 자동 닫힘</p>
                </div>
                <button
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 text-[#9CA3AF] hover:text-[#374151] transition-colors"
                  aria-label="닫기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 휴가 취소 승인 → 중앙 모달 팝업 (확인 클릭 시 새로고침) */}
      <Dialog
        open={!!vacApproved}
        onOpenChange={open => { if (!open) handleVacApprovedConfirm() }}
      >
        <DialogContent className="max-w-xs text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40">
              <Sun className="h-9 w-9 text-green-500" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">
              취소 완료
            </DialogTitle>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] whitespace-pre-wrap">
              {vacApproved?.message || '신청하신 휴가 취소가 승인되었습니다.'}
            </p>
            <Button className="w-full mt-2" onClick={handleVacApprovedConfirm}>
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
