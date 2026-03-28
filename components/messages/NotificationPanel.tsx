'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, MessageSquare, Send as SendIcon, ArrowDownLeft, ArrowUpRight, CornerUpRight, CornerUpLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ForwardModal } from './ForwardModal'

interface Message {
  id: string
  sender_id: string
  sender_name: string
  recipient_id: string | null
  recipient_name: string | null
  team_id: string | null
  team_name: string | null
  content: string
  is_read: boolean
  created_at: string
}

interface NotificationPanelProps {
  userId: string
  teamId: string | null
}

function formatFull(iso: string) {
  try { return format(parseISO(iso), 'yyyy년 M월 d일 HH:mm', { locale: ko }) } catch { return '' }
}
function formatShort(iso: string) {
  try { return format(parseISO(iso), 'M/d HH:mm', { locale: ko }) } catch { return '' }
}

// ── Detail Dialog ─────────────────────────────────────────────────────────────
interface DetailState {
  msg: Message
  type: 'received' | 'sent'
}

function MessageDetailDialog({
  detail,
  onClose,
  onReply,
  onForward,
}: {
  detail: DetailState | null
  onClose: () => void
  onReply: (msg: Message) => void
  onForward: (msg: Message) => void
}) {
  if (!detail) return null
  const { msg, type } = detail
  const isSent = type === 'sent'

  const targetLabel = isSent
    ? (msg.team_id ? `${msg.team_name ?? '팀'} 전체` : (msg.recipient_name ?? '알 수 없음'))
    : msg.sender_name

  return (
    <Dialog open={!!detail} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {isSent
              ? <ArrowUpRight className="h-4 w-4 text-[#10B981]" />
              : <ArrowDownLeft className="h-4 w-4 text-[#2563EB]" />}
            {isSent ? '보낸 메시지' : '받은 메시지'}
          </DialogTitle>
        </DialogHeader>

        {/* Meta */}
        <div className="rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] px-4 py-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[#6B7280]">{isSent ? '받는 사람' : '보낸 사람'}</span>
            <span className="font-semibold text-[#111827] flex items-center gap-1">
              {targetLabel}
              {!isSent && msg.team_id && (
                <span className="text-[10px] text-[#6B7280] font-normal bg-[#F3F4F6] px-1.5 py-0.5 rounded">팀</span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6B7280]">시간</span>
            <span className="text-[#374151]">{formatFull(msg.created_at)}</span>
          </div>
          {isSent && (
            <div className="flex justify-between">
              <span className="text-[#6B7280]">읽음 여부</span>
              <span className={msg.is_read ? 'text-[#10B981] font-medium' : 'text-[#9CA3AF]'}>
                {msg.is_read ? '✓ 읽음' : '미확인'}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="rounded-lg border border-[#E5E7EB] px-4 py-3">
          <p className="text-sm text-[#111827] whitespace-pre-wrap break-words leading-relaxed">
            {msg.content}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {/* 답장 — 받은 메시지이고 개인 발신자가 있을 때만 */}
          {!isSent && msg.sender_id && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5 text-[#2563EB] border-[#BFDBFE] hover:bg-[#EFF6FF]"
              onClick={() => { onReply(msg); onClose() }}
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
              답장
            </Button>
          )}
          {/* 전달 — 항상 가능 */}
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 text-[#6B7280] hover:text-[#111827]"
            onClick={() => { onForward(msg); onClose() }}
          >
            <CornerUpRight className="h-3.5 w-3.5" />
            전달
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function NotificationPanel({ userId, teamId }: NotificationPanelProps) {
  const [isOpen,   setIsOpen]   = useState(false)
  const [tab,      setTab]      = useState<'received' | 'sent'>('received')
  const [received, setReceived] = useState<Message[]>([])
  const [sent,     setSent]     = useState<Message[]>([])
  const [detail,   setDetail]   = useState<DetailState | null>(null)
  const [forward,  setForward]  = useState<{ msg: Message; mode: 'reply' | 'forward' } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = received.filter(m => !m.is_read).length

  // ── Fetch ─────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    const [recRes, sentRes] = await Promise.all([
      fetch('/api/messages?type=received'),
      fetch('/api/messages?type=sent'),
    ])
    if (recRes.ok)  setReceived(await recRes.json())
    if (sentRes.ok) setSent(await sentRes.json())
  }, [])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => { if (isOpen) fetchMessages() }, [isOpen, fetchMessages])

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('notification-panel-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cg_messages' }, (payload) => {
        const msg = payload.new as Message
        if (msg.sender_id === userId) {
          setSent(prev => [msg, ...prev])
        } else if (msg.recipient_id === userId || (teamId && msg.team_id === teamId)) {
          setReceived(prev => [msg, ...prev])
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, teamId])

  // ── Outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [isOpen])

  // ── Click row ─────────────────────────────────────────────
  const handleMsgClick = async (msg: Message, type: 'received' | 'sent') => {
    setDetail({ msg, type })
    if (type === 'received' && !msg.is_read) {
      const res = await fetch(`/api/messages/${msg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      })
      if (res.ok) {
        const updated = { ...msg, is_read: true }
        setReceived(prev => prev.map(m => m.id === msg.id ? updated : m))
        setDetail({ msg: updated, type })
      }
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      <div ref={panelRef} className="relative">
        {/* Bell */}
        <button
          onClick={() => setIsOpen(o => !o)}
          className="relative p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] transition-colors"
          aria-label="알림"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-[#E5E7EB] rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
              <h3 className="text-sm font-semibold text-[#111827]">메시지 알림</h3>
              <button onClick={() => setIsOpen(false)} className="text-[#9CA3AF] hover:text-[#374151] transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#E5E7EB]">
              {(['received', 'sent'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                    tab === t ? 'border-[#2563EB] text-[#2563EB]' : 'border-transparent text-[#6B7280] hover:text-[#374151]'
                  }`}
                >
                  {t === 'received' ? <MessageSquare className="h-3.5 w-3.5" /> : <SendIcon className="h-3.5 w-3.5" />}
                  {t === 'received' ? '받은 메시지' : '보낸 메시지'}
                  {t === 'received' && unreadCount > 0 && (
                    <span className="bg-[#EF4444] text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">{unreadCount}</span>
                  )}
                  {t === 'sent' && sent.length > 0 && (
                    <span className="bg-[#6B7280] text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">{sent.length > 99 ? '99+' : sent.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-[#F3F4F6]">
              {tab === 'received' ? (
                received.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF] text-center py-10">받은 메시지가 없습니다.</p>
                ) : received.map(msg => (
                  <button key={msg.id} onClick={() => handleMsgClick(msg, 'received')}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-[#F9FAFB] transition-colors ${!msg.is_read ? 'bg-[#EFF6FF]' : ''}`}
                  >
                    <div className="shrink-0 w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center mt-0.5">
                      <MessageSquare className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-[#111827] flex items-center gap-1">
                          {msg.sender_name}
                          {msg.team_id && <span className="text-[10px] text-[#6B7280] font-normal bg-[#F3F4F6] px-1.5 py-0.5 rounded">팀</span>}
                        </p>
                        <span className="text-[10px] text-[#9CA3AF] shrink-0">{formatShort(msg.created_at)}</span>
                      </div>
                      <p className="text-xs text-[#374151] mt-0.5 line-clamp-1 break-words">{msg.content}</p>
                    </div>
                    {!msg.is_read && <div className="shrink-0 w-2 h-2 bg-[#2563EB] rounded-full mt-2" />}
                  </button>
                ))
              ) : (
                sent.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF] text-center py-10">보낸 메시지가 없습니다.</p>
                ) : sent.map(msg => (
                  <button key={msg.id} onClick={() => handleMsgClick(msg, 'sent')}
                    className="w-full text-left px-4 py-3 flex gap-3 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-full bg-[#10B981] flex items-center justify-center mt-0.5">
                      <SendIcon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-[#111827]">
                          → {msg.team_id ? `${msg.team_name ?? '팀'} 전체` : (msg.recipient_name ?? '알 수 없음')}
                        </p>
                        <span className="text-[10px] text-[#9CA3AF] shrink-0">{formatShort(msg.created_at)}</span>
                      </div>
                      <p className="text-xs text-[#374151] mt-0.5 line-clamp-1 break-words">{msg.content}</p>
                      {msg.is_read && <p className="text-[10px] text-[#10B981] mt-0.5 font-medium">✓ 읽음</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <MessageDetailDialog
        detail={detail}
        onClose={() => setDetail(null)}
        onReply={msg => setForward({ msg, mode: 'reply' })}
        onForward={msg => setForward({ msg, mode: 'forward' })}
      />

      {/* Forward / Reply modal */}
      {forward && (
        <ForwardModal
          isOpen={!!forward}
          onClose={() => setForward(null)}
          originalContent={forward.msg.content}
          originalSender={forward.msg.sender_name}
          mode={forward.mode}
          replyRecipientId={forward.msg.sender_id}
          replyRecipientName={forward.msg.sender_name}
        />
      )}
    </>
  )
}
