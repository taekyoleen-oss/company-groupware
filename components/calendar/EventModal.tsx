'use client'
import { useState, useEffect } from 'react'
import { format, addHours, setHours, setMinutes, setSeconds, setMilliseconds, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { User, Clock, MapPin, Tag, Eye, Bell, Palmtree } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { EventCategory } from '@/types/app'

const VISIBILITY_LABEL = { company: '전사 공개', team: '팀 공개', private: '나만 보기' }
const VACATION_COLOR = '#F97316'

interface VacationSummary {
  total_days: number
  used_days: number
  remaining_days: number
}

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  initialDate?: Date | null
  eventId?: string | null
  onSuccess: () => void
}

// 로컬 날짜 문자열(YYYY-MM-DD)에서 일수 계산
function calcDaysFromLocalStr(startStr: string, endStr: string): number {
  const s = new Date(startStr.slice(0, 10))
  const e = new Date(endStr.slice(0, 10))
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

export function EventModal({ isOpen, onClose, initialDate, eventId, onSuccess }: EventModalProps) {
  const { showToast, ToastComponent } = useToast()
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [createdBy, setCreatedBy] = useState<string | null>(null)
  const [authorName, setAuthorName] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [eventData, setEventData] = useState<any>(null)
  const [notify, setNotify] = useState(false)
  const [vacationSummary, setVacationSummary] = useState<VacationSummary | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    start_at: '',
    end_at: '',
    is_all_day: false,
    is_vacation: false,
    location: '',
    visibility: 'private' as 'company' | 'team' | 'private',
    category_id: '',
    color: '',
  })

  useEffect(() => {
    fetch('/api/admin/categories').then(r => r.json()).then(setCategories).catch(() => {})
    fetch('/api/profiles').then(r => r.json()).then((p: any) => {
      setCurrentUserId(p?.id ?? null)
      setCurrentUserName(p?.full_name ?? '')
      setIsAdmin(p?.role === 'admin')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (initialDate && isOpen) {
      setEventData(null)
      setNotify(false)
      setVacationSummary(null)
      const start = setMilliseconds(setSeconds(setMinutes(setHours(initialDate, 9), 0), 0), 0)
      const end = addHours(start, 1)
      setForm(f => ({
        ...f,
        is_vacation: false,
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
        const isVac = data.is_vacation ?? false
        setForm({
          title: data.title ?? '',
          description: data.description ?? '',
          start_at: format(new Date(data.start_at), "yyyy-MM-dd'T'HH:mm"),
          end_at: format(new Date(data.end_at), "yyyy-MM-dd'T'HH:mm"),
          is_all_day: data.is_all_day ?? false,
          is_vacation: isVac,
          location: data.location ?? '',
          visibility: data.visibility ?? 'private',
          category_id: data.category_id ?? 'none',
          color: data.color ?? '',
        })
        if (isVac) {
          fetch('/api/vacation').then(r => r.json()).then(setVacationSummary).catch(() => {})
        }
      }).catch(() => {})
    } else if (!eventId) {
      setEventData(null)
      setCreatedBy(null)
      setAuthorName(null)
      setVacationSummary(null)
    }
  }, [eventId, isOpen])

  const handleVacationToggle = (checked: boolean) => {
    if (checked) {
      // 휴가 체크: 제목 자동 설정, 종일, 전사 공개, 주황색
      setForm(f => ({
        ...f,
        is_vacation: true,
        title: currentUserName ? `휴가(${currentUserName})` : '휴가',
        is_all_day: true,
        visibility: 'company',
        color: VACATION_COLOR,
        // 날짜는 현재 값의 날짜 부분만 유지
        start_at: f.start_at.slice(0, 10) + 'T00:00',
        end_at: f.end_at.slice(0, 10) + 'T00:00',
      }))
      fetch('/api/vacation').then(r => r.json()).then(setVacationSummary).catch(() => {})
    } else {
      setForm(f => ({
        ...f,
        is_vacation: false,
        title: '',
        color: '',
      }))
      setVacationSummary(null)
    }
  }

  const canEdit = !eventId || isAdmin || createdBy === currentUserId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { showToast('제목을 입력해주세요.', 'error'); return }
    if (!form.is_all_day && new Date(form.end_at) <= new Date(form.start_at)) {
      showToast('종료 시간은 시작 시간보다 뒤여야 합니다.', 'error'); return
    }

    // 휴가 일수 초과 검사 (remainingAfterChange 재사용)
    if (form.is_vacation && vacationSummary) {
      if (remainingAfterChange < 0) {
        const effective = vacationSummary.remaining_days + origVacDays
        showToast(
          `휴가 일수가 부족합니다. 사용 가능: ${effective}일, 요청: ${pendingVacDays}일`,
          'error'
        )
        return
      }
    }

    setLoading(true)
    const payload = {
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: form.is_all_day
        ? new Date(form.end_at.slice(0, 10) + 'T23:59').toISOString()
        : new Date(form.end_at).toISOString(),
      category_id: (form.category_id && form.category_id !== 'none') ? form.category_id : null,
      color: form.color || null,
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
    if (!eventId) return
    setDeleting(true)
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
    setDeleting(false)
    setDeleteConfirmOpen(false)
    if (res.ok) {
      showToast('일정이 삭제되었습니다.', 'success')
      setTimeout(() => { onSuccess(); onClose() }, 500)
    } else {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  const canDelete = eventId && (isAdmin || createdBy === currentUserId)

  // 현재 선택된 휴가 일수
  const pendingVacDays = form.is_vacation && form.start_at && form.end_at
    ? calcDaysFromLocalStr(form.start_at, form.end_at)
    : 0

  // 기존 휴가 이벤트 편집 시 원래 일수 (vacationSummary의 used_days에 이미 포함됨)
  const origVacDays = (eventId && eventData?.is_vacation && eventData?.start_at && eventData?.end_at)
    ? calcDaysFromLocalStr(
        format(new Date(eventData.start_at), "yyyy-MM-dd'T'HH:mm"),
        format(new Date(eventData.end_at), "yyyy-MM-dd'T'HH:mm")
      )
    : 0

  // 변경 후 잔여 일수: 기존 이벤트 편집이면 원래 일수를 되돌린 뒤 새 일수 차감
  const remainingAfterChange = vacationSummary
    ? vacationSummary.remaining_days + origVacDays - pendingVacDays
    : 0

  // ── 읽기 전용 뷰 ──────────────────────────────────────────
  const ReadOnlyView = () => {
    if (!eventData) return <div className="py-6 text-center text-sm text-[#6B7280]">불러오는 중...</div>
    const cat = eventData.category
    return (
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{VISIBILITY_LABEL[eventData.visibility as keyof typeof VISIBILITY_LABEL]}</Badge>
          {eventData.is_vacation && (
            <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-xs">휴가</Badge>
          )}
        </div>
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
      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>일정 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6B7280]">이 일정을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>취소</Button>
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
              {/* 휴가 체크박스 */}
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors ${
                form.is_vacation
                  ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800'
                  : 'bg-[#F9FAFB] border-[#E5E7EB] dark:bg-[#1E293B] dark:border-[#334155]'
              }`}>
                <input
                  id="is_vacation"
                  type="checkbox"
                  checked={form.is_vacation}
                  onChange={e => handleVacationToggle(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer accent-orange-500"
                />
                <label htmlFor="is_vacation" className="flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none text-orange-600 dark:text-orange-400">
                  <Palmtree className="h-4 w-4" />
                  휴가 일정
                </label>
                {form.is_vacation && vacationSummary && (
                  <span className="ml-auto text-xs text-[#6B7280]">
                    잔여 <span className={`font-semibold ${vacationSummary.remaining_days <= 0 ? 'text-red-500' : 'text-orange-600'}`}>
                      {vacationSummary.remaining_days}
                    </span>/{vacationSummary.total_days}일
                  </span>
                )}
              </div>

              {/* 제목 */}
              <div>
                <label className="block text-sm font-medium mb-1">제목 *</label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={form.is_vacation ? `휴가(이름)` : '일정 제목'}
                  required
                />
              </div>

              {/* 종일 체크 (휴가 시 비활성) */}
              <div className="flex items-center gap-2">
                <input id="is_all_day" type="checkbox" checked={form.is_all_day}
                  onChange={e => setForm(f => ({ ...f, is_all_day: e.target.checked }))}
                  disabled={form.is_vacation}
                  className="w-4 h-4 rounded accent-[#2563EB] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
                <label htmlFor="is_all_day" className="text-sm text-[#374151] dark:text-[#D1D5DB] cursor-pointer select-none">
                  종일
                  {form.is_vacation && <span className="ml-1 text-xs text-orange-500">(휴가는 종일로 자동 설정)</span>}
                </label>
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
                    ? <Input type="date" value={form.end_at.slice(0, 10)} onChange={e => setForm(f => ({ ...f, end_at: e.target.value + 'T00:00' }))} required />
                    : <Input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} required />
                  }
                </div>
              </div>

              {/* 휴가 일수 미리보기 */}
              {form.is_vacation && pendingVacDays > 0 && (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm">
                  <span className="text-orange-700 dark:text-orange-300">
                    선택한 기간: <strong>{pendingVacDays}일</strong>
                    {vacationSummary && (
                      <span className="ml-2 text-[#6B7280]">
                        (저장 후 잔여:{' '}
                        <span className={remainingAfterChange < 0 ? 'text-red-500 font-semibold' : ''}>
                          {remainingAfterChange}일
                        </span>
                        )
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* 공개 범위 + 카테고리 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">공개 범위</label>
                  <Select
                    value={form.visibility}
                    onValueChange={v => setForm(f => ({ ...f, visibility: v as any }))}
                    disabled={form.is_vacation}
                  >
                    <SelectTrigger className={form.is_vacation ? 'opacity-60' : ''}><SelectValue /></SelectTrigger>
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

              {/* 장소 (휴가 시 숨김) */}
              {!form.is_vacation && (
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">장소</label>
                  <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="장소 (선택)" />
                </div>
              )}

              {/* 설명 */}
              <div>
                <label className="block text-xs font-medium mb-1 text-[#6B7280]">설명</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-[#E5E7EB] dark:border-[#334155] px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white dark:bg-[#0F172A]"
                  placeholder="설명 (선택)"
                />
              </div>

              {/* 관련자 알림 */}
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
                  <Button type="button" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2]" onClick={() => setDeleteConfirmOpen(true)} disabled={deleting}>
                    삭제
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
