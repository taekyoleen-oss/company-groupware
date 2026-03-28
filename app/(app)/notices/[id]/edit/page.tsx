'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { NoticeEditor } from '@/components/notices/NoticeEditor'
import { useToast } from '@/components/ui/toast'

export default function EditNoticePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id
  const { showToast, ToastComponent } = useToast()

  const [form, setForm] = useState({ title: '', content: '', visibility: 'company' as 'company' | 'team', is_pinned: false })
  const [canPin, setCanPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/notices/${id}`).then(r => r.json()),
      fetch('/api/profiles').then(r => r.json()),
    ]).then(([notice, profile]) => {
      setForm({
        title: notice.title ?? '',
        content: notice.content ?? '',
        visibility: notice.visibility ?? 'company',
        is_pinned: notice.is_pinned ?? false,
      })
      if (profile?.role === 'manager' || profile?.role === 'admin') setCanPin(true)
      setInitializing(false)
    }).catch(() => {
      router.push(`/notices/${id}`)
    })
  }, [id, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.content) { showToast('제목과 내용을 입력해주세요.', 'error'); return }
    setLoading(true)
    const res = await fetch(`/api/notices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      showToast('공지가 수정되었습니다.', 'success')
      setTimeout(() => router.push(`/notices/${id}`), 500)
    } else {
      const data = await res.json()
      showToast(data.error ?? '오류가 발생했습니다.', 'error')
    }
  }

  if (initializing) return <div className="p-4 text-sm text-[#6B7280]">불러오는 중...</div>

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Link href={`/notices/${id}`} className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#111827] mb-4">
        <ArrowLeft className="h-4 w-4" /> 돌아가기
      </Link>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
        <h1 className="text-xl font-bold mb-6">공지 수정</h1>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">제목 *</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="공지 제목" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">공개 범위</label>
            <Select value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">전사 공지</SelectItem>
                <SelectItem value="team">팀 공지</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canPin && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="pin" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded" />
              <label htmlFor="pin" className="text-sm font-medium cursor-pointer">📌 상단 고정</label>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">내용 *</label>
            <NoticeEditor content={form.content} onChange={content => setForm(f => ({ ...f, content }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => router.push(`/notices/${id}`)}>취소</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
      {ToastComponent}
    </div>
  )
}
