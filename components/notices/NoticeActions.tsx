'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NoticeActions({ noticeId }: { noticeId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('공지를 삭제하시겠습니까?')) return
    setDeleting(true)
    const res = await fetch(`/api/notices/${noticeId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/notices')
      router.refresh()
    } else {
      alert('삭제에 실패했습니다.')
      setDeleting(false)
    }
  }

  return (
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
        onClick={handleDelete}
        disabled={deleting}
      >
        <Trash2 className="h-3 w-3 mr-1" />
        삭제
      </Button>
    </div>
  )
}
