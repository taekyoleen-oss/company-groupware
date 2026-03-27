'use client'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface KakaoShareButtonProps {
  type: 'event' | 'notice'
  id: string
  title: string
}

export function KakaoShareButton({ type, id, title }: KakaoShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [text, setText] = useState('')
  const { showToast, ToastComponent } = useToast()

  const handleOpen = async () => {
    const res = await fetch(`/api/share/kakao?type=${type}&id=${id}`)
    if (res.ok) {
      const data = await res.json()
      setText(data.text)
      setIsOpen(true)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    showToast('클립보드에 복사되었습니다.', 'success')
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <MessageCircle className="h-4 w-4 mr-1.5" />
        카카오톡 공유
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>카카오톡 공유</DialogTitle>
          </DialogHeader>
          <div className="bg-[#F9FAFB] rounded-lg p-4 whitespace-pre-line text-sm font-mono border border-[#E5E7EB]">
            {text}
          </div>
          <p className="text-xs text-[#6B7280]">위 텍스트를 복사하여 카카오톡에 붙여넣기 하세요.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsOpen(false)}>닫기</Button>
            <Button onClick={handleCopy}>클립보드 복사</Button>
          </div>
        </DialogContent>
      </Dialog>
      {ToastComponent}
    </>
  )
}
