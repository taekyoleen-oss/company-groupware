'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { NoticeEditor } from '@/components/notices/NoticeEditor'
import { useToast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'

export default function NewNoticePage() {
  const router = useRouter()
  const { showToast, ToastComponent } = useToast()
  const [form, setForm] = useState({ title: '', content: '', visibility: 'company' as 'company' | 'team', is_pinned: false })
  const [files, setFiles] = useState<File[]>([])
  const [canPin, setCanPin] = useState(false)
  const [loading, setLoading] = useState(false)

  useState(() => {
    createClient().from('cg_profiles').select('role').then(({ data }) => {
      const d = data as any
      if (d?.[0]?.role === 'manager' || d?.[0]?.role === 'admin') setCanPin(true)
    })
  })

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? [])
    if (files.length + newFiles.length > 3) { showToast('첨부파일은 최대 3개까지 가능합니다.', 'error'); return }
    const oversized = newFiles.find(f => f.size > 10 * 1024 * 1024)
    if (oversized) { showToast('파일 크기는 10MB 이하여야 합니다.', 'error'); return }
    setFiles(prev => [...prev, ...newFiles])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.content) { showToast('제목과 내용을 입력해주세요.', 'error'); return }
    setLoading(true)
    const res = await fetch('/api/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const data = await res.json()
      showToast(data.error ?? '오류가 발생했습니다.', 'error')
      setLoading(false)
      return
    }
    const notice = await res.json()
    // Upload attachments
    if (files.length > 0) {
      const supabase = createClient()
      for (const file of files) {
        const { data: uploadData } = await supabase.storage.from('notice-attachments').upload(`${notice.id}/${Date.now()}-${file.name}`, file)
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('notice-attachments').getPublicUrl(uploadData.path)
          await fetch(`/api/notices/${notice.id}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: file.name, file_url: urlData.publicUrl, file_size: file.size, file_type: file.type }),
          })
        }
      }
    }
    showToast('공지가 등록되었습니다.', 'success')
    setTimeout(() => router.push('/notices'), 500)
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Link href="/notices" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#111827] mb-4">
        <ArrowLeft className="h-4 w-4" /> 목록으로
      </Link>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
        <h1 className="text-xl font-bold mb-6">새 공지 작성</h1>
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
          <div>
            <label className="block text-sm font-medium mb-1">첨부파일 (최대 3개, 10MB)</label>
            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-[#6B7280]">{file.name}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4 text-[#6B7280]" />
                  </button>
                </div>
              ))}
              {files.length < 3 && (
                <label className="cursor-pointer">
                  <span className="text-sm text-[#2563EB] hover:underline">+ 파일 추가</span>
                  <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={handleFileAdd} className="hidden" />
                </label>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => router.push('/notices')}>취소</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? '등록 중...' : '등록'}</Button>
          </div>
        </form>
      </div>
      {ToastComponent}
    </div>
  )
}
