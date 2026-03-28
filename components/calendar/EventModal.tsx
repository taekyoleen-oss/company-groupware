'use client'
import { useState, useEffect } from 'react'
import { format, addHours, setHours, setMinutes, setSeconds, setMilliseconds, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { User, Clock, MapPin, Tag, Eye, Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EventCategory } from '@/types/app'

const VISIBILITY_LABEL = { company: '전사 공개', team: '팀 공개', private: '나만 보기' }

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
  const [authorName, setAuthorName] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [eventData, setEventData] = useState<any>(null)
  const [notify, setNotify] = useState(false)
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
      setEventData(null)
      setNotify(false)
      const start = setMilliseconds(setSeconds(setMinutes(setHours(initialDate, 9), 0), 0), 0)
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
        setAuthorName(data.author?.full_name ?? null)
        setEventData(data)
        setNotify(false)
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
    } else if (!eventId) {
      setEventData(null)
      setCreatedBy(null)
      setAuthorName(null)
    }
  }, [eventId, isOpen])

  const canEdit = !eventId || isAdmin || createdBy === currentUserId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const payload = {
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
      category_id: (form.category_id && form.category_id !== 'none') ? form.category_id : null,
      color: form.color || null,
      // notify 는 신규 등록 시만 전송
      ...(!eventId && form.visibility !== 'private' ? { notify } : {}),
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

  // ── 읽기 전용 뷰 ──────────────────────────────────────────
  const ReadOnlyView = () => {
    if (!eventData) return <div className="py-6 text-center text-sm text-[#6B7280]">불러오는 중...</div>
    const cat = eventData.category
    return (
      <div className="space-y-3 pt-1">
        <Badge variant="outline">{VISIBILITY_LABEL[eventData.visibility as keyof typeof VISIBILITY_LABEL]}</Badge>
        <div className="flex items-start gap-2 text-sm text-[#6B7280]">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {eventData.is_all_day
              ? format(parseISO(eventData.start_at), 'yyyy년 M월 d일', { locale: ko }) + ' 하루 종일'
              : `${format(parseISO(eventData.start_at), 'M월 d일 HH:mm', { locale: ko })} ~ ${format(parseISO(eventData.end_at), 'HH:mm')}`
            }
          </span>
        </div>
        {eventData.location && (
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <MapPin className="h-4 w-4 shrink-0" /><span>{eventData.location}</span>
          </div>
        )}
        {cat && (
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <Tag className="h-4 w-4 shrink-0" />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </span>
          </div>
        )}
        {authorName && (
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <User className="h-4 w-4 shrink-0" /><span>{authorName}</span>
          </div>
        )}
        {eventData.description && (
          <div className="mt-2 pt-3 border-t border-[#E5E7EB] text-sm text-[#111827] whitespace-pre-wrap">
            {eventData.description}
          </div>
        )}
        <div className="pt-2">
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>닫기</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {eventId
                ? (canEdit ? '일정 수정' : (eventData?.title ?? '일정 상세'))
                : '새 일정'
              }
            </DialogTitle>
            {eventId && authorName && (
              <p className="flex items-center gap-1.5 text-xs text-[#6B7280] mt-1">
                <User className="h-3.5 w-3.5" />
                작성자: <span className="font-medium text-[#374151]">{authorName}</span>
                {!canEdit && <span className="ml-1 text-[#9CA3AF] flex items-center gap-0.5"><Eye className="h-3 w-3" /> 읽기 전용</span>}
              </p>
            )}
          </DialogHeader>

          {eventId && !canEdit ? (
            <ReadOnlyView />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* 제목 */}
              <div>
                <label className="block text-sm font-medium mb-1">제목 *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="일정 제목" required />
              </div>

              {/* 종일 체크 */}
              <div className="flex items-center gap-2">
                <input id="is_all_day" type="checkbox" checked={form.is_all_day}
                  onChange={e => setForm(f => ({ ...f, is_all_day: e.target.checked }))}
                  className="w-4 h-4 rounded accent-[#2563EB] cursor-pointer" />
                <label htmlFor="is_all_day" className="text-sm text-[#374151] cursor-pointer select-none">종일</label>
              </div>

              {/* 시작 / 종료 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">시작</label>
                  {form.is_all_day
                    ? <Input type="date" value={form.start_at.slice(0, 10)} onChange={e => setForm(f => ({ ...f, start_at: e.target.value + 'T00:00' }))} required />
                    : <Input type="datetime-local" value={form.start_at} onChange={e => {
                        const s = e.target.value
                        setForm(f => ({ ...f, start_at: s, end_at: format(addHours(new Date(s), 1), "yyyy-MM-dd'T'HH:mm") }))
                      }} required />
                  }
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">종료</label>
                  {form.is_all_day
                    ? <Input type="date" value={form.end_at.slice(0, 10)} onChange={e => setForm(f => ({ ...f, end_at: e.target.value + 'T23:59' }))} required />
                    : <Input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} required />
                  }
                </div>
              </div>

              {/* 공개 범위 + 카테고리 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">공개 범위</label>
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
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">카테고리</label>
                  <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="없음" /></SelectTrigger>
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
              </div>

              {/* 장소 */}
              <div>
                <label className="block text-xs font-medium mb-1 text-[#6B7280]">장소</label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="장소 (선택)" />
              </div>

              {/* 설명 */}
              <div>
                <label className="block text-xs font-medium mb-1 text-[#6B7280]">설명</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  placeholder="설명 (선택)"
                />
              </div>

              {/* 관련자 알림 — 나만보기가 아닐 때만 표시 */}
              {!eventId && form.visibility !== 'private' && (
                <div className="flex items-center gap-2 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] px-3 py-2">
                  <input
                    id="notify"
                    type="checkbox"
                    checked={notify}
                    onChange={e => setNotify(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#2563EB] cursor-pointer"
                  />
                  <label htmlFor="notify" className="flex items-center gap-1.5 text-sm text-[#2563EB] cursor-pointer select-none">
                    <Bell className="h-3.5 w-3.5" />
                    관련자에게 알림 발송
                    <span className="text-xs text-[#6B7280]">
                      ({form.visibility === 'company' ? '전체 사원' : '팀원'})
                    </span>
                  </label>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 pt-1">
                {canDelete && (
                  <Button type="button" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2]" onClick={handleDelete} disabled={deleting}>
                    {deleting ? '삭제 중...' : '삭제'}
                  </Button>
                )}
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
                <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {ToastComponent}
    </>
  )
}
