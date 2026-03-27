'use client'
import { useState, useEffect } from 'react'
import { format, addHours } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import type { EventCategory } from '@/types/app'

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  initialDate?: Date | null
  eventId?: string | null
  onSuccess: () => void
}

export function EventModal({ isOpen, onClose, initialDate, eventId, onSuccess }: EventModalProps) {
  const { showToast, ToastComponent } = useToast()
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    start_at: '',
    end_at: '',
    is_all_day: false,
    location: '',
    visibility: 'private' as 'company' | 'team' | 'private',
    category_id: '',
    color: '',
  })

  useEffect(() => {
    fetch('/api/admin/categories').then(r => r.json()).then(setCategories).catch(() => {})
    fetch('/api/profiles').then(r => r.json()).then((p: any) => {
      setCurrentUserId(p?.id ?? null)
      setIsAdmin(p?.role === 'admin')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (initialDate && isOpen) {
      const start = initialDate
      const end = addHours(start, 1)
      setForm(f => ({
        ...f,
        start_at: format(start, "yyyy-MM-dd'T'HH:mm"),
        end_at: format(end, "yyyy-MM-dd'T'HH:mm"),
      }))
    }
  }, [initialDate, isOpen])

  useEffect(() => {
    if (eventId && isOpen) {
      fetch(`/api/events/${eventId}`).then(r => r.json()).then(data => {
        setCreatedBy(data.created_by ?? null)
        setForm({
          title: data.title ?? '',
          description: data.description ?? '',
          start_at: format(new Date(data.start_at), "yyyy-MM-dd'T'HH:mm"),
          end_at: format(new Date(data.end_at), "yyyy-MM-dd'T'HH:mm"),
          is_all_day: data.is_all_day ?? false,
          location: data.location ?? '',
          visibility: data.visibility ?? 'private',
          category_id: data.category_id ?? 'none',
          color: data.color ?? '',
        })
      }).catch(() => {})
    }
  }, [eventId, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const payload = {
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
      category_id: (form.category_id && form.category_id !== 'none') ? form.category_id : null,
      color: form.color || null,
    }
    const url = eventId ? `/api/events/${eventId}` : '/api/events'
    const method = eventId ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setLoading(false)
    if (res.ok) {
      showToast(eventId ? '일정이 수정되었습니다.' : '일정이 등록되었습니다.', 'success')
      setTimeout(() => { onSuccess(); onClose() }, 500)
    } else {
      const data = await res.json()
      showToast(data.error ?? '오류가 발생했습니다.', 'error')
    }
  }

  const handleDelete = async () => {
    if (!eventId || !confirm('일정을 삭제하시겠습니까?')) return
    setDeleting(true)
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      showToast('일정이 삭제되었습니다.', 'success')
      setTimeout(() => { onSuccess(); onClose() }, 500)
    } else {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  const canDelete = eventId && (isAdmin || createdBy === currentUserId)

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{eventId ? '일정 수정' : '새 일정'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">제목 *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="일정 제목" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1">시작</label>
                <Input type="datetime-local" value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">종료</label>
                <Input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">공개 범위</label>
              <Select value={form.visibility} onValueChange={v => setForm(f => ({ ...f, visibility: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">나만 보기</SelectItem>
                  <SelectItem value="team">팀 공개</SelectItem>
                  <SelectItem value="company">전사 공개</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">카테고리</label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">없음</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">장소</label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="장소 (선택)" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">설명</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                placeholder="설명 (선택)"
              />
            </div>
            <div className="flex gap-2 pt-2">
              {canDelete && (
                <Button type="button" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2]" onClick={handleDelete} disabled={deleting}>
                  {deleting ? '삭제 중...' : '삭제'}
                </Button>
              )}
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {ToastComponent}
    </>
  )
}
