'use client'
import { useState } from 'react'
import { CornerUpRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RecipientSelect, type RecipientOption } from './RecipientSelect'
import { useToast } from '@/components/ui/toast'

interface ForwardModalProps {
  isOpen: boolean
  onClose: () => void
  originalContent: string  // 원본 메시지 내용
  originalSender: string   // 원본 발신자 이름 (표시용)
  mode: 'forward' | 'reply'
  replyRecipientId?: string
  replyRecipientName?: string
}

export function ForwardModal({
  isOpen, onClose,
  originalContent, originalSender,
  mode, replyRecipientId, replyRecipientName,
}: ForwardModalProps) {
  const { showToast, ToastComponent } = useToast()
  const [recipient, setRecipient] = useState<RecipientOption | null>(
    // 답장이면 발신자를 미리 설정
    mode === 'reply' && replyRecipientId && replyRecipientName
      ? { type: 'user', id: replyRecipientId, name: replyRecipientName }
      : null
  )
  const [note, setNote]       = useState('')
  const [sending, setSending] = useState(false)

  const handleClose = () => {
    setNote('')
    if (mode !== 'reply') setRecipient(null)
    onClose()
  }

  const handleSend = async () => {
    if (!recipient) return
    setSending(true)

    const prefix = mode === 'reply'
      ? `[답장]\n`
      : `[전달] ${originalSender}님의 메시지\n`

    const content = note.trim()
      ? `${prefix}${note.trim()}\n\n--- 원본 메시지 ---\n${originalContent}`
      : `${prefix}--- 원본 메시지 ---\n${originalContent}`

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        recipient_id: recipient.type === 'user' ? recipient.id : null,
        team_id:      recipient.type === 'team' ? recipient.id : null,
      }),
    })
    setSending(false)
    if (res.ok) {
      showToast(mode === 'reply' ? '답장을 보냈습니다.' : '메시지를 전달했습니다.', 'success')
      setTimeout(handleClose, 600)
    } else {
      const err = await res.json()
      showToast(err.error ?? '전송에 실패했습니다.', 'error')
    }
  }

  const title = mode === 'reply' ? '답장하기' : '전달하기'
  const icon  = <CornerUpRight className="h-4 w-4 text-[#2563EB]" />

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {icon} {title}
            </DialogTitle>
          </DialogHeader>

          {/* 원본 메시지 미리보기 */}
          <div className="rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2.5">
            <p className="text-[10px] text-[#9CA3AF] mb-1">원본 메시지 — {originalSender}</p>
            <p className="text-xs text-[#374151] line-clamp-3 break-words">{originalContent}</p>
          </div>

          {/* 수신자 선택 */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              {mode === 'reply' ? '답장 대상' : '전달 대상'} *
            </label>
            <RecipientSelect
              value={recipient}
              onChange={setRecipient}
              placeholder="받을 사람 또는 팀 선택..."
            />
          </div>

          {/* 추가 메시지 */}
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              {mode === 'reply' ? '답장 내용' : '추가 메시지'} (선택)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend() }}
              className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              placeholder={mode === 'reply' ? '답장 메시지를 입력하세요...' : '전달 시 추가할 메시지를 입력하세요...'}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>취소</Button>
            <Button
              className="flex-1"
              onClick={handleSend}
              disabled={sending || !recipient}
            >
              {sending ? '전송 중...' : (mode === 'reply' ? '답장 전송' : '전달하기')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {ToastComponent}
    </>
  )
}
