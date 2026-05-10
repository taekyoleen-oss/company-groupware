'use client'
import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Clock, User, Sun, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { countWorkdays } from '@/lib/utils/holidayDates'

type VacationType = 'full' | 'morning' | 'afternoon'

const VAC_TYPE_LABEL: Record<VacationType, string> = {
  full: '종일',
  morning: '오전 반차',
  afternoon: '오후 반차',
}
const VAC_TYPE_TIME: Record<VacationType, string> = {
  full: '',
  morning: '09:00 ~ 14:00',
  afternoon: '14:00 ~ 18:00',
}

interface VacationSummary {
  total_days: number
  used_days: number
  remaining_days: number
}

export interface VacationModalProps {
  isOpen: boolean
  onClose: () => void
  initialDate?: Date | null
  eventId?: string | null
  onSuccess: () => void
}

function calcDays(startStr: string, endStr: string): number {
  return countWorkdays(startStr.slice(0, 10), endStr.slice(0, 10))
}

function buildTitle(type: VacationType, name: string): string {
  const label = type === 'full' ? '휴가' : type === 'morning' ? '오전반차' : '오후반차'
  return name ? `${label}(${name})` : label
}

export function VacationModal({ isOpen, onClose, initialDate, eventId, onSuccess }: VacationModalProps) {
  const { showToast, ToastComponent } = useToast()

  const [loading, setLoading]                     = useState(false)
  const [deleting, setDeleting]                   = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [vacSaveConfirmOpen, setVacSaveConfirmOpen] = useState(false)
  const [cancelRequestOpen, setCancelRequestOpen] = useState(false)
  const [cancelReason, setCancelReason]           = useState('')
  const [cancelLoading, setCancelLoading]         = useState(false)

  const [createdBy, setCreatedBy]           = useState<string | null>(null)
  const [authorName, setAuthorName]         = useState<string | null>(null)
  const [currentUserId, setCurrentUserId]   = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [isAdmin, setIsAdmin]               = useState(false)
  const [eventData, setEventData]           = useState<any>(null)
  const [vacationSummary, setVacationSummary] = useState<VacationSummary | null>(null)
  const [vacationType, setVacationType]     = useState<VacationType>('full')
  const [form, setForm] = useState({ title: '', description: '', start_at: '', end_at: '' })

  useEffect(() => {
    fetch('/api/profiles').then(r => r.json()).then((p: any) => {
      setCurrentUserId(p?.id ?? null)
      setCurrentUserName(p?.full_name ?? '')
      setIsAdmin(p?.role === 'admin')
    }).catch(() => {})
  }, [])

  // New vacation
  useEffect(() => {
    if (!isOpen || eventId) return
    const date = initialDate ?? new Date()
    const dateStr = format(date, 'yyyy-MM-dd')
    setEventData(null)
    setCreatedBy(null)
    setAuthorName(null)
    setVacationType('full')
    setForm({
      title: buildTitle('full', currentUserName),
      description: '',
      start_at: dateStr + 'T00:00',
      end_at: dateStr + 'T00:00',
    })
    fetch('/api/vacation').then(r => r.json()).then(setVacationSummary).catch(() => {})
  }, [isOpen, eventId, initialDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update title when currentUserName loads (new vacation only)
  useEffect(() => {
    if (!eventId && isOpen && currentUserName) {
      setForm(f => ({ ...f, title: buildTitle(vacationType, currentUserName) }))
    }
  }, [currentUserName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Edit existing vacation
  useEffect(() => {
    if (!eventId || !isOpen) return
    fetch(`/api/events/${eventId}`).then(r => r.json()).then(data => {
      setCreatedBy(data.created_by ?? null)
      setAuthorName(data.author?.full_name ?? null)
      setEventData(data)
      setForm({
        title: data.title ?? '',
        description: data.description ?? '',
        start_at: format(new Date(data.start_at), "yyyy-MM-dd'T'HH:mm"),
        end_at: format(new Date(data.end_at), "yyyy-MM-dd'T'HH:mm"),
      })
      if (data.is_all_day) {
        setVacationType('full')
      } else {
        const hour = parseInt(format(new Date(data.start_at), 'HH'))
        setVacationType(hour < 12 ? 'morning' : 'afternoon')
      }
      fetch('/api/vacation').then(r => r.json()).then(setVacationSummary).catch(() => {})
    }).catch(() => {})
  }, [eventId, isOpen])

  const handleVacationTypeChange = (type: VacationType) => {
    setVacationType(type)
    const dateStr = form.start_at.slice(0, 10)
    const times =
      type === 'full'      ? { start: 'T00:00', end: 'T00:00' } :
      type === 'morning'   ? { start: 'T09:00', end: 'T14:00' } :
                             { start: 'T14:00', end: 'T18:00' }
    setForm(f => ({
      ...f,
      title: buildTitle(type, currentUserName),
      start_at: dateStr + times.start,
      end_at: dateStr + times.end,
    }))
  }

  const canEdit = !eventId || isAdmin || createdBy === currentUserId
  const canDirectDelete = !!eventId && isAdmin
  const canRequestCancellation = !!eventId && !isAdmin && createdBy === currentUserId

  const isAllDay = vacationType === 'full'

  const pendingVacDays = form.start_at && form.end_at
    ? (isAllDay ? calcDays(form.start_at, form.end_at) : 0.5)
    : 0

  const origVacDays = (eventId && eventData?.start_at && eventData?.end_at)
    ? (eventData.is_all_day === false
        ? 0.5
        : calcDays(
            format(new Date(eventData.start_at), "yyyy-MM-dd'T'HH:mm"),
            format(new Date(eventData.end_at), "yyyy-MM-dd'T'HH:mm"),
          ))
    : 0

  const remainingAfterChange = vacationSummary
    ? vacationSummary.remaining_days + origVacDays - pendingVacDays
    : 0

  const executeSave = async () => {
    setLoading(true)
    const payload = {
      title: form.title || buildTitle(vacationType, currentUserName),
      description: form.description,
      start_at: new Date(form.start_at).toISOString(),
      end_at: isAllDay
        ? new Date(form.end_at.slice(0, 10) + 'T23:59').toISOString()
        : new Date(form.end_at).toISOString(),
      is_all_day: isAllDay,
      is_vacation: true,
      visibility: 'company',
      color: '#F97316',
      category_id: null,
    }
    const url = eventId ? `/api/events/${eventId}` : '/api/events'
    const method = eventId ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setLoading(false)
    if (res.ok) {
      showToast(eventId ? '휴가가 수정되었습니다.' : '휴가가 등록되었습니다.', 'success')
      setTimeout(() => { onSuccess(); onClose() }, 500)
    } else {
      const data = await res.json()
      showToast(data.error ?? '오류가 발생했습니다.', 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (vacationSummary && remainingAfterChange < 0) {
      showToast(`휴가 일수가 부족합니다. 사용 가능: ${vacationSummary.remaining_days + origVacDays}일, 요청: ${pendingVacDays}일`, 'error')
      return
    }
    if (!eventId) {
      setVacSaveConfirmOpen(true)
      return
    }
    await executeSave()
  }

  const handleDelete = async () => {
    if (!eventId) return
    setDeleting(true)
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
    setDeleting(false)
    setDeleteConfirmOpen(false)
    if (res.ok) {
      showToast('휴가가 삭제되었습니다.', 'success')
      setTimeout(() => { onSuccess(); onClose() }, 500)
    } else {
      showToast('삭제에 실패했습니다.', 'error')
    }
  }

  const handleCancelRequest = async () => {
    if (!eventId) return
    setCancelLoading(true)
    const res = await fetch('/api/vacation-cancel-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, reason: cancelReason }),
    })
    setCancelLoading(false)
    if (res.ok) {
      showToast('취소 신청이 접수되었습니다. 관리자의 승인 후 취소됩니다.', 'success')
      setCancelRequestOpen(false)
      setCancelReason('')
      setTimeout(() => { onSuccess(); onClose() }, 800)
    } else {
      const data = await res.json()
      showToast(data.error ?? '취소 신청에 실패했습니다.', 'error')
    }
  }

  const ReadOnlyView = () => {
    if (!eventData) return <div className="py-6 text-center text-sm text-[#6B7280]">불러오는 중...</div>
    const vacTypeLabel = eventData.is_all_day
      ? '종일'
      : (parseInt(format(parseISO(eventData.start_at), 'HH')) < 12 ? '오전반차' : '오후반차')
    return (
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-2">
          <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-xs">
            휴가 ({vacTypeLabel})
          </Badge>
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
      {/* 삭제 확인 */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>휴가 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-[#6B7280]">이 휴가를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>취소</Button>
            <Button className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white" onClick={handleDelete} disabled={deleting}>
              {deleting ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 휴가 등록 확인 */}
      <Dialog open={vacSaveConfirmOpen} onOpenChange={setVacSaveConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              휴가 등록 확인
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                등록한 휴가를 취소하는 경우, <strong>관리자가 승인</strong>해야 합니다.
              </p>
            </div>
            <p className="text-sm text-[#6B7280]">위 내용을 확인하셨습니까? 그래도 휴가를 등록하시겠습니까?</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setVacSaveConfirmOpen(false)}>취소</Button>
              <Button
                type="button"
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => { setVacSaveConfirmOpen(false); executeSave() }}
                disabled={loading}
              >
                {loading ? '등록 중...' : '확인 후 등록'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 휴가 취소 신청 */}
      <Dialog open={cancelRequestOpen} onOpenChange={open => { setCancelRequestOpen(open); if (!open) setCancelReason('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>휴가 취소 신청</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280] leading-relaxed">
              등록한 휴가를 취소하려면 <strong>관리자의 승인</strong>이 필요합니다.
              취소 신청을 하면 관리자에게 승인 요청이 전달됩니다.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">취소 사유 <span className="text-[#9CA3AF] font-normal">(선택)</span></label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="w-full rounded-lg border border-[#E5E7EB] dark:border-[#334155] px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#0F172A]"
                placeholder="취소 사유를 입력해 주세요."
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setCancelRequestOpen(false); setCancelReason('') }}>취소</Button>
              <Button type="button" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" onClick={handleCancelRequest} disabled={cancelLoading}>
                {cancelLoading ? '신청 중...' : '취소 신청'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 메인 모달 */}
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-orange-500" />
              {eventId ? (canEdit ? '휴가 수정' : (eventData?.title ?? '휴가 상세')) : '휴가 신청'}
            </DialogTitle>
            {eventId && authorName && (
              <p className="flex items-center gap-1.5 text-xs text-[#6B7280] mt-1">
                <User className="h-3.5 w-3.5" />
                작성자: <span className="font-medium text-[#374151]">{authorName}</span>
              </p>
            )}
          </DialogHeader>

          {eventId && !canEdit ? (
            <ReadOnlyView />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* 잔여 휴가 */}
              {vacationSummary && (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-3 py-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-orange-700 dark:text-orange-300">
                    <Sun className="h-4 w-4" />
                    휴가 잔여
                  </span>
                  <span className="text-sm">
                    <span className={`font-semibold ${vacationSummary.remaining_days <= 0 ? 'text-red-500' : 'text-orange-600'}`}>
                      {vacationSummary.remaining_days}
                    </span>
                    <span className="text-[#6B7280]">/{vacationSummary.total_days}일</span>
                  </span>
                </div>
              )}

              {/* 휴가 유형 */}
              <div>
                <label className="block text-xs font-medium mb-1.5 text-[#6B7280]">휴가 유형</label>
                <div className="flex rounded-lg border border-[#E5E7EB] dark:border-[#334155] overflow-hidden">
                  {(['full', 'morning', 'afternoon'] as VacationType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleVacationTypeChange(type)}
                      className={`flex-1 py-2 text-center transition-colors border-r last:border-r-0 border-[#E5E7EB] dark:border-[#334155] ${
                        vacationType === type
                          ? 'bg-orange-500 text-white'
                          : 'bg-white dark:bg-[#1E293B] text-[#374151] dark:text-[#D1D5DB] hover:bg-orange-50 dark:hover:bg-orange-950/20'
                      }`}
                    >
                      <div className="text-xs font-medium">{VAC_TYPE_LABEL[type]}</div>
                      {VAC_TYPE_TIME[type] && (
                        <div className={`text-[10px] mt-0.5 ${vacationType === type ? 'text-orange-100' : 'text-[#9CA3AF]'}`}>
                          {VAC_TYPE_TIME[type]}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 날짜 */}
              {vacationType === 'full' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-[#6B7280]">시작일</label>
                    <Input type="date" value={form.start_at.slice(0, 10)}
                      onChange={e => setForm(f => ({ ...f, start_at: e.target.value + 'T00:00', end_at: e.target.value + 'T00:00' }))} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-[#6B7280]">종료일</label>
                    <Input type="date" value={form.end_at.slice(0, 10)}
                      onChange={e => setForm(f => ({ ...f, end_at: e.target.value + 'T00:00' }))} required />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-[#6B7280]">날짜</label>
                    <Input type="date" value={form.start_at.slice(0, 10)}
                      onChange={e => {
                        const d = e.target.value
                        const times = vacationType === 'morning'
                          ? { start: 'T09:00', end: 'T14:00' }
                          : { start: 'T14:00', end: 'T18:00' }
                        setForm(f => ({ ...f, start_at: d + times.start, end_at: d + times.end }))
                      }} required />
                  </div>
                  <div className="pb-1">
                    <p className="text-xs text-[#6B7280] mb-1">자동 시간</p>
                    <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                      {VAC_TYPE_TIME[vacationType]}
                    </p>
                  </div>
                </div>
              )}

              {/* 일수 미리보기 */}
              {pendingVacDays > 0 && (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-3 py-2 text-sm">
                  <span className="text-orange-700 dark:text-orange-300">
                    선택한 기간: <strong>{pendingVacDays}일</strong>
                    {vacationType !== 'full' && <span className="ml-1 text-xs text-[#6B7280]">(반차)</span>}
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

              {/* 제목 */}
              <div>
                <label className="block text-xs font-medium mb-1 text-[#6B7280]">제목</label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="자동 입력"
                />
              </div>

              {/* 설명 */}
              <div>
                <label className="block text-xs font-medium mb-1 text-[#6B7280]">설명 (선택)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-[#E5E7EB] dark:border-[#334155] px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#0F172A]"
                  placeholder="설명을 입력해 주세요."
                />
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-1">
                {canRequestCancellation && (
                  <Button type="button" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => setCancelRequestOpen(true)}>
                    취소 신청
                  </Button>
                )}
                {canDirectDelete && (
                  <Button type="button" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2]" onClick={() => setDeleteConfirmOpen(true)} disabled={deleting}>
                    삭제
                  </Button>
                )}
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
                <Button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading}>
                  {loading ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {ToastComponent}
    </>
  )
}
