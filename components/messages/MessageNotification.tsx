'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  sender_name: string
  content: string
  is_team: boolean
}

interface MessageNotificationProps {
  userId: string
  teamId: string | null
}

const AUTO_DISMISS_MS = 10_000 // 10초 후 자동 닫힘

export function MessageNotification({ userId, teamId }: MessageNotificationProps) {
  const [items, setItems]   = useState<Notification[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setItems(prev => prev.filter(n => n.id !== id))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('cg-messages-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cg_messages' },
        (payload) => {
          const msg = payload.new as any
          // 내가 보낸 메시지는 팝업 생략
          if (msg.sender_id === userId) return

          const isForMe   = msg.recipient_id === userId
          const isForTeam = teamId && msg.team_id === teamId
          if (!isForMe && !isForTeam) return

          const notification: Notification = {
            id:          msg.id,
            sender_name: msg.sender_name,
            content:     msg.content,
            is_team:     !!msg.team_id,
          }

          setItems(prev => [...prev.slice(-4), notification])

          // 10초 후 자동 닫힘
          timers.current[msg.id] = setTimeout(() => dismiss(msg.id), AUTO_DISMISS_MS)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      Object.values(timers.current).forEach(clearTimeout)
    }
  }, [userId, teamId, dismiss])

  if (items.length === 0) return null

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: '20rem' }}>
      {items.map(item => (
        <div
          key={item.id}
          className="bg-white border border-[#E5E7EB] rounded-xl shadow-lg p-3.5 flex items-start gap-3"
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#111827] flex items-center gap-1">
              {item.sender_name}
              {item.is_team && (
                <span className="text-[10px] text-[#6B7280] font-normal bg-[#F3F4F6] px-1.5 py-0.5 rounded">
                  팀
                </span>
              )}
            </p>
            <p className="text-xs text-[#374151] mt-0.5 whitespace-pre-wrap break-words line-clamp-4">
              {item.content}
            </p>
            <p className="text-[10px] text-[#9CA3AF] mt-1">알림에서 확인하세요 · 10초 후 자동 닫힘</p>
          </div>
          {/* 수동 닫기 */}
          <button
            onClick={() => dismiss(item.id)}
            className="shrink-0 text-[#9CA3AF] hover:text-[#374151] transition-colors"
            aria-label="닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
