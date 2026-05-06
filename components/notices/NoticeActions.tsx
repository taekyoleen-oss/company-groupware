'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function NoticeActions({ noticeId }: { noticeId: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    const res = await fetch(`/api/notices/${noticeId}`, { method: 'DELETE' })
    setDeleting(false)
    setConfirmOpen(false)
    if (res.ok) {
      router.push('/notices')
      router.refresh()
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => router.push(`/notices/${noticeId}/edit`)}
        >
          <Pencil className="h-3 w-3 mr-1" />
          수정
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2]"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          삭제
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>공지 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
            이 공지를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button
              className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
