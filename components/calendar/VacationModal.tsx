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
import { useProfile } from '@/lib/hooks/use-shared-data'

type VacationType = 'full' | 'morning' | 'afternoon'

const VAC_TYPE_LABEL: Record<VacationType, string> = {
  full: '종일휴가',
  morning: '오전휴가',
  afternoon: '오후휴가',
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

export interface VacationPrefill {
  title?: string
  description?: string
  startDate?: string
  endDate?: string
}

export interface VacationModalProps {
  isOpen: boolean
  onClose: () => void
  initialDate?: Date | null
  eventId?: string | null
  onSuccess: () => void
  /** 일반 일정에서 "휴가로 전환" 시 넘어온 초기값 (신규 신청 시에만 사용) */
  prefill?: VacationPrefill | null
}

function calcDays(startStr: string, endStr: string): number {
  return countWorkdays(startStr.slice(0, 10), endStr.slice(0, 10))
}

function buildTitle(type: VacationType, name: string): string {
  const label = type === 'full' ? '종일휴가' : type === 'morning' ? '오전휴가' : '오후휴가'
  return name ? `${label}(${name})` : label
}

export function VacationModal({ isOpen, onClose, initialDate, eventId, onSuccess, prefill }: VacationModalProps) {
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
  const [isAdmin, setIsAdmin]               = useState(false)  // 앱관리자(super_admin) — 타인 휴가 직접 삭제/수정 권한
  const [isApproverRole, setIsApproverRole] = useState(false)  // 결재자 역할(manager 또는 super_admin) — 자기결재 자동승인 판정용
  const [approverId, setApproverId]         = useState<string | null>(null)
  const [approverName, setApproverName]     = useState<string | null>(null)
  const [eventData, setEventData]           = useState<any>(null)
  const [vacationSummary, setVacationSummary] = useState<VacationSummary | null>(null)
  const [vacationType, setVacationType]     = useState<VacationType>('full')
  const [form, setForm] = useState({ title: '', description: '', start_at: '', end_at: '' })

  // 휴가 대리 게시 (앱관리자가 지정한 전사 1명)
  const [proxyUserId, setProxyUserId]   = useState<string | null>(null)
  const [proxyTargets, setProxyTargets] = useState<{ id: string; full_name: string; role: string }[]>([])
  const [targetUserId, setTargetUserId] = useState<string>('') // '' = 본인 신청

  // 모달을 열 때마다 진행 상태를 초기화 (직전 저장/삭제의 loading 잔상 방지)
  useEffect(() => {
    if (isOpen) { setLoading(false); setDeleting(false); setCancelLoading(false) }
  }, [isOpen])

  // SWR — /api/profiles 가 여러 컴포넌트에서 호출되어도 30s 내 1회만 네트워크
  const { data: profileSwr } = useProfile()
  useEffect(() => {
    if (!profileSwr) return
    const p: any = profileSwr
    setCurrentUserId(p?.id ?? null)
    setCurrentUserName(p?.full_name ?? '')
    const superAdmin = p?.is_super_admin === true || (p?.is_super_admin == null && p?.role === 'admin')
    setIsAdmin(superAdmin)
    // 결재자 역할 = 관리자(manager) 또는 앱관리자. 본인이 결재자고 외부 결재자도 없으면 자기결재.
    setIsApproverRole(superAdmin || p?.role === 'manager')
    setApproverId(p?.approver_id ?? null)
    setApproverName(p?.approver?.full_name ?? null)
  }, [profileSwr])

  // New vacation
  useEffect(() => {
    if (!isOpen || eventId) return
    const date = initialDate ?? new Date()
    const dateStr = format(date, 'yyyy-MM-dd')
    const startStr = prefill?.startDate ?? dateStr
    const endStr = prefill?.endDate ?? startStr
    setEventData(null)
    setCreatedBy(null)
    setAuthorName(null)
    setVacationType('full')
    setTargetUserId('')
    setForm({
      title: prefill?.title || buildTitle('full', currentUserName),
      description: prefill?.description ?? '',
      start_at: startStr + 'T00:00',
      end_at: endStr + 'T00:00',
    })
    fetch('/api/vacation').then(r => r.json()).then(setVacationSummary).catch(() => {})
    // 대리 게시자 지정 여부 확인 (설정 GET 은 로그인 사용자 모두 조회 가능)
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => setProxyUserId(d?.vacation_proxy_user_id ?? null))
      .catch(() => setProxyUserId(null))
  }, [isOpen, eventId, initialDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const isProxy = !!currentUserId && proxyUserId === currentUserId

  // 대리 게시자에게만 대상자 목록 로드 (활성 사용자, 본인 제외, 앱관리자 제외)
  useEffect(() => {
    if (!isOpen || eventId || !isProxy) return
    fetch('/api/profiles/list')
      .then(r => r.json())
      .then(d => setProxyTargets(((d?.profiles ?? []) as any[]).filter(p => p.role !== 'admin')))
      .catch(() => setProxyTargets([]))
  }, [isOpen, eventId, isProxy])

  // 현재 신청 명의자 이름 (대상자 선택 시 대상자, 아니면 본인)
  const activeName = targetUserId
    ? (proxyTargets.find(t => t.id === targetUserId)?.full_name ?? '')
    : currentUserName

  const handleTargetChange = (value: string) => {
    setTargetUserId(value)
    const name = value
      ? (proxyTargets.find(t => t.id === value)?.full_name ?? '')
      : currentUserName
    if (!prefill?.title) {
      setForm(f => ({ ...f, title: buildTitle(vacationType, name) }))
    }
  }

  // Update title when currentUserName loads (new vacation only)
  useEffect(() => {
    // 전환으로 넘어온 사용자 지정 제목은 덮어쓰지 않는다. 대상자 선택 중이면 대상자 이름 유지.
    if (!eventId && isOpen && currentUserName && !prefill?.title && !targetUserId) {
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
      // 전환으로 넘어온 사용자 지정 제목은 유지, 그 외에는 유형에 맞춰 자동 생성
      title: prefill?.title ? f.title : buildTitle(type, activeName),
      start_at: dateStr + times.start,
      end_at: dateStr + times.end,
    }))
  }

  const isOwner = createdBy === currentUserId
  const canEdit = !eventId || isAdmin || isOwner
  // 직접 삭제는 앱관리자가 "타인의 휴가"를 관리할 때만 허용.
  // 본인 휴가는 결재자 역할이라도 항상 취소 신청 → 앱관리자 결재를 거친다.
  const canDirectDelete = !!eventId && isAdmin && !isOwner
  const canRequestCancellation = !!eventId && isOwner

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

  // 본인이 결재자 역할(관리자 또는 앱관리자) + 외부 결재자 미지정 → 휴가 신청 자동 승인.
  // (취소는 자동 처리되지 않고 항상 앱관리자가 결재)
  // 대리 신청(대상자 선택)은 항상 대상자의 결재 규칙으로 진행되므로 자동 승인 없음.
  const isSelfApproved = !targetUserId && isApproverRole && approverId == null

  const executeSave = async () => {
    setLoading(true)
    const payload = {
      title: form.title || buildTitle(vacationType, activeName),
      description: form.description,
      start_at: new Date(form.start_at).toISOString(),
      end_at: isAllDay
        ? new Date(form.end_at.slice(0, 10) + 'T23:59').toISOString()
        : new Date(form.end_at).toISOString(),
      is_all_day: isAllDay,
      ...(targetUserId ? { target_user_id: targetUserId } : {}),
    }
    try {
      if (eventId) {
        // 기존 이벤트 수정: cg_events 직접 PATCH (관리자/본인)
        const res = await fetch(`/api/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            is_vacation: true,
            visibility: 'company',
            color: '#F97316',
            category_id: null,
          }),
        })
        if (res.ok) {
          showToast('휴가가 수정되었습니다.', 'success')
          // 성공 시 loading 유지(버튼 비활성)한 채 닫아 중복 제출 방지
          setTimeout(() => { onSuccess(); onClose() }, 500)
          return
        }
        const data = await res.json().catch(() => ({}))
        showToast((data as any).error ?? '오류가 발생했습니다.', 'error')
        setLoading(false)
        return
      }

      // 신규 신청 → /api/vacation/request (자동승인/결재대기를 서버가 분기)
      const res = await fetch('/api/vacation/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (targetUserId) {
          showToast(`${activeName} 님의 휴가 대리 신청이 접수되었습니다. 결재 승인 후 확정됩니다.`, 'success')
        } else if (data.mode === 'pending') {
          const targetName = approverName ?? (approverId ? '결재자' : '관리자')
          showToast(`결재 요청이 ${targetName}에게 전달되었습니다.`, 'success')
        } else {
          showToast('휴가가 등록되었습니다.', 'success')
        }
        setTimeout(() => { onSuccess(); onClose() }, 500)
        return
      }
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '오류가 발생했습니다.', 'error')
      setLoading(false)
    } catch {
      showToast('네트워크 오류로 저장하지 못했습니다. 다시 시도해 주세요.', 'error')
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 잔여일수 클라이언트 검증은 본인 신청에만 적용 (대리 신청은 대상자 잔여를 결재자가 판단)
    if (!targetUserId && vacationSummary && remainingAfterChange < 0) {
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
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
      setDeleteConfirmOpen(false)
      if (res.ok) {
        showToast('휴가가 삭제되었습니다.', 'success')
        setTimeout(() => { onSuccess(); onClose() }, 500)
      } else {
        showToast('삭제에 실패했습니다.', 'error')
      }
    } catch {
      showToast('네트워크 오류로 삭제하지 못했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleCancelRequest = async () => {
    if (!eventId) return
    setCancelLoading(true)
    try {
      const res = await fetch('/api/vacation-cancel-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, reason: cancelReason }),
      })
      if (res.ok) {
        showToast('취소 신청이 접수되었습니다. 관리자의 승인 후 취소됩니다.', 'success')
        setCancelRequestOpen(false)
        setCancelReason('')
        setTimeout(() => { onSuccess(); onClose() }, 800)
      } else {
        const data = await res.json().catch(() => ({}))
        showToast((data as any).error ?? '취소 신청에 실패했습니다.', 'error')
      }
    } catch {
      showToast('네트워크 오류로 취소 신청에 실패했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setCancelLoading(false)
    }
  }

  const ReadOnlyView = () => {
    if (!eventData) return <div className="py-6 text-center text-sm text-[#6B7280]">불러오는 중...</div>
    const vacTypeLabel = eventData.is_all_day
      ? '종일휴가'
      : (parseInt(format(parseISO(eventData.start_at), 'HH')) < 12 ? '오전휴가' : '오후휴가')
    return (
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-2">
          <Badge className="bg-orange-100 text-orange-700 border border-orange-200 text-xs">
            {vacTypeLabel}
          </Badge>
        </div>
        <div className="flex items-start gap-2 text-sm text-[#6B7280]">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {eventData.is_all_day
              ? `${format(parseISO(eventData.start_at), 'yyyy년 M월 d일', { locale: ko })} ~ ${format(parseISO(eventData.end_at), 'M월 d일', { locale: ko })}`
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
        <div className="flex gap-2 pt-2">
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
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>닫기</Button>
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

      {/* 휴가 등록/신청 확인 */}
      <Dialog open={vacSaveConfirmOpen} onOpenChange={setVacSaveConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {isSelfApproved ? '휴가 등록 확인' : '휴가 신청 확인'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isSelfApproved ? (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                  본인이 결재자이므로 <strong>즉시 등록</strong>됩니다.
                  등록한 휴가를 취소하는 경우 <strong>앱관리자가 승인</strong>해야 삭제할 수 있습니다.
                </p>
              </div>
            ) : targetUserId ? (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                  <strong>{activeName}</strong> 님 명의로 대리 신청합니다.
                  {activeName ? ` ${activeName} 님의` : ' 대상자의'} 결재자(미지정 시 관리자)의 <strong>승인 후</strong> 휴가가 등록되며,
                  휴가 일수도 {activeName || '대상자'} 님 기준으로 차감됩니다.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                  결재자({approverName ?? (approverId ? '지정 결재자' : '관리자')})의 <strong>승인 후</strong> 휴가가 등록됩니다.
                  취소 시에도 결재자 승인이 필요합니다.
                </p>
              </div>
            )}
            <p className="text-sm text-[#6B7280]">
              {isSelfApproved ? '위 내용을 확인하셨습니까? 휴가를 등록하시겠습니까?' : '위 내용을 확인하셨습니까? 결재 요청을 보내시겠습니까?'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setVacSaveConfirmOpen(false)}>취소</Button>
              <Button
                type="button"
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => { setVacSaveConfirmOpen(false); executeSave() }}
                disabled={loading}
              >
                {loading ? '처리 중...' : (isSelfApproved ? '확인 후 등록' : '결재 요청 보내기')}
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
              {eventId ? '휴가 상세' : '휴가 신청'}
            </DialogTitle>
            {eventId && authorName && (
              <p className="flex items-center gap-1.5 text-xs text-[#6B7280] mt-1">
                <User className="h-3.5 w-3.5" />
                작성자: <span className="font-medium text-[#374151]">{authorName}</span>
              </p>
            )}
          </DialogHeader>

          {eventId ? (
            <ReadOnlyView />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* 대상자 선택 — 대리 게시자에게만 노출 */}
              {isProxy && proxyTargets.length > 0 && (
                <div>
                  <label className="block text-xs font-medium mb-1 text-[#6B7280]">신청 대상자</label>
                  <select
                    value={targetUserId}
                    onChange={e => handleTargetChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0F172A] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">본인 ({currentUserName})</option>
                    {proxyTargets.map(t => (
                      <option key={t.id} value={t.id}>{t.full_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 잔여 휴가 — 본인 신청일 때만 (대리 신청 시 본인 잔여는 무관) */}
              {!targetUserId && vacationSummary && (
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

              {/* 결재자 안내 */}
              <div className={`rounded-lg px-3 py-2 border text-xs ${
                isSelfApproved
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                  : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
              }`}>
                <p className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {targetUserId ? (
                    <span className="font-medium">
                      대리 신청 — {activeName} 님의 결재자(미지정 시 관리자) 승인 후 확정됩니다
                    </span>
                  ) : (
                    <>
                      결재자:{' '}
                      <span className="font-medium">
                        {isSelfApproved
                          ? '본인 (즉시 등록)'
                          : (approverName ?? (approverId ? '지정 결재자' : '관리자'))}
                        {!isSelfApproved && ' — 승인 필요'}
                      </span>
                    </>
                  )}
                </p>
              </div>


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
                    {vacationType !== 'full' && <span className="ml-1 text-xs text-[#6B7280]">(반일)</span>}
                    {!targetUserId && vacationSummary && (
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
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>취소</Button>
                <Button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading}>
                  {loading ? '처리 중...' : (isSelfApproved ? '등록' : '결재 요청')}
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
