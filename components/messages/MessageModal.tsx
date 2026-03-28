'use client'
import { useState } from 'react'
import { Send } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

interface MessageModalProps {
  isOpen: boolean
  onClose: () => void
  recipientId?: string
  recipientName?: string
  teamId?: string
  teamName?: string
}

export function MessageModal({
  isOpen,
  onClose,
  recipientId,
  recipientName,
  teamId,
  teamName,
}: MessageModalProps) {
  const { showToast, ToastComponent } = useToast()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!content.trim()) return
    setSending(true)
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content:      content.trim(),
        recipient_id: recipientId ?? null,
        team_id:      teamId ?? null,
      }),
    })
    setSending(false)
    if (res.ok) {
      showToast('메시지를 전송했습니다.', 'success')
      setTimeout(() => { setContent(''); onClose() }, 500)
    } else {
      const err = await res.json()
      showToast(err.error ?? '전송에 실패했습니다.', 'error')
    }
  }

  const target = recipientName
    ? `${recipientName}님에게`
    : `${teamName} 팀 전체에게`

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setContent(''); onClose() } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[#2563EB]" />
              메시지 보내기
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-[#6B7280]">
            <span className="font-medium text-[#111827]">{target}</span> 메시지를 보냅니다.
          </p>

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend()
            }}
            className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            placeholder="메시지를 입력하세요... (Ctrl+Enter 전송)"
            autoFocus
          />

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => { setContent(''); onClose() }}>
              취소
            </Button>
            <Button
              className="flex-1"
              onClick={handleSend}
              disabled={sending || !content.trim()}
            >
              {sending ? '전송 중...' : '전송'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {ToastComponent}
    </>
  )
}
