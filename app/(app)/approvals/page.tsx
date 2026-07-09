'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, X, Save, Sun, CheckCircle, XCircle, ClipboardCheck, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { UserAvatar } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

interface EmpSummary {
  id: string
  full_name: string
  color: string
  team_id: string | null
  role: string
  status: string
  total_days: number
  used_days: number
  pending_days: number
  remaining_days: number
}

interface VacReq {
  id: string
  requested_by: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  is_all_day: boolean
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  reviewed_at: string | null
  created_at: string
  requester: { id: string; full_name: string; color: string } | null
  reviewer: { id: string; full_name: string; color: string } | null
}

interface CancelReq {
  id: string
  event_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  reason: string | null
  created_at: string
  reviewed_at: string | null
  event_title: string | null
  event_start_at: string | null
  event_end_at: string | null
  event_is_all_day: boolean | null
  requester: { id: string; full_name: string; color: string } | null
  reviewer: { id: string; full_name: string; color: string } | null
  event: { id: string; title: string; start_at: string; end_at: string; is_all_day: boolean } | null
}

interface HistoryItem {
  id: string
  kind: 'grant' | 'cancel_approved' | 'cancel_rejected' | 'request_rejected'
  happened_at: string
  requester: { id: string; full_name: string; color: string } | null
  event_title: string
  event_start_at: string | null
  event_end_at: string | null
  event_is_all_day: boolean
  reviewer: { id: string; full_name: string; color: string } | null
  reason: string | null
}

// 결재자(관리자) 전용 페이지.
// /admin 은 앱관리자 전용이고, 이 페이지는 본인이 결재자로 지정된 직원만 다룬다.
export default function ApprovalsPage() {
  const router = useRouter()
  const { showToast, ToastComponent } = useToast()
  const [employees, setEmployees] = useState<EmpSummary[]>([])
  const [vacReqs, setVacReqs] = useState<VacReq[]>([])
  const [cancelReqs, setCancelReqs] = useState<CancelReq[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [vacEdits, setVacEdits] = useState<Record<string, number>>({})
  const [vacSaving, setVacSaving] = useState<string | null>(null)
  const [approveDone, setApproveDone] = useState<null | 'cancel' | 'vac'>(null)
  // 활성 탭 — 승인 후 직원 휴가 탭으로 자동 전환
  const [activeTab, setActiveTab] = useState<string>('requests')
  // 직원 휴가 처리 이력 (결재자 범위) — 사장님 팀일 땐 숨김
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [isPresidentTeam, setIsPresidentTeam] = useState(false)

  const fetchAll = useCallback(async () => {
    const [approverRes, historyRes] = await Promise.all([
      fetch('/api/vacation/approver'),
      fetch('/api/vacation-history'),
    ])
    if (approverRes.ok) {
      const data = await approverRes.json()
      const emps: EmpSummary[] = Array.isArray(data.employees) ? data.employees : []
      setEmployees(emps)
      const initVac: Record<string, number> = {}
      emps.forEach(e => { initVac[e.id] = e.total_days })
      setVacEdits(initVac)
      setVacReqs(Array.isArray(data.vacation_requests) ? data.vacation_requests : [])
      setCancelReqs(Array.isArray(data.cancel_requests) ? data.cancel_requests : [])
      setIsPresidentTeam(data.viewer?.is_president_team === true)
    }
    if (historyRes.ok) {
      const items: HistoryItem[] = await historyRes.json()
      setHistoryItems(Array.isArray(items) ? items : [])
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('approvals-page-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_cancel_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_requests' }, () => fetchAll())
      .subscribe()
    const handler = () => fetchAll()
    window.addEventListener('vacation-cancel-approved', handler)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('vacation-cancel-approved', handler)
    }
  }, [fetchAll])

  const handleVacAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessing(id)
    let reject_reason: string | null = null
    if (action === 'reject') {
      const r = window.prompt('거부 사유를 입력해 주세요. (선택)')
      // 취소(Esc/취소 버튼) 시 null → 거부를 진행하지 않고 중단
      if (r === null) { setProcessing(null); return }
      reject_reason = r
    }
    try {
      const res = await fetch(`/api/vacation/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reject_reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast((data as any).error ?? '처리에 실패했습니다.', 'error')
        return
      }
      if (action === 'approve') setApproveDone('vac')
      else { showToast('휴가 신청이 거부되었습니다.', 'success'); fetchAll() }
    } catch {
      showToast('네트워크 오류로 처리하지 못했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const handleCancelAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessing(id)
    try {
      const res = await fetch(`/api/vacation-cancel-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast((data as any).error ?? '처리에 실패했습니다.', 'error')
        return
      }
      if (action === 'approve') setApproveDone('cancel')
      else { showToast('취소 신청이 거부되었습니다.', 'success'); fetchAll() }
    } catch {
      showToast('네트워크 오류로 처리하지 못했습니다. 다시 시도해 주세요.', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const saveTotalDays = async (userId: string) => {
    const target = employees.find(e => e.id === userId)
    if (!target) return
    const newDays = vacEdits[userId]
    if (newDays === undefined || newDays === target.total_days) return
    setVacSaving(userId)
    const res = await fetch(`/api/admin/vacation/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_days: newDays }),
    })
    setVacSaving(null)
    if (res.ok) { showToast('저장되었습니다.', 'success'); fetchAll() }
    else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '저장에 실패했습니다.', 'error')
    }
  }

  const pendingVac = vacReqs.filter(r => r.status === 'pending')
  const pendingCancel = cancelReqs.filter(r => r.status === 'pending')
  const totalPending = pendingVac.length + pendingCancel.length

  const fmtRange = (startAt: string, endAt: string, allDay: boolean) => {
    try {
      const s = parseISO(startAt)
      const e = parseISO(endAt)
      if (allDay) {
        const sDate = format(s, 'M월 d일', { locale: ko })
        const eDate = format(e, 'M월 d일', { locale: ko })
        return sDate === eDate ? sDate : `${sDate} ~ ${eDate}`
      }
      return `${format(s, 'M월 d일 HH:mm')} ~ ${format(e, 'HH:mm')}`
    } catch { return '' }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9] flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> 결재함
        </h1>
        <Button variant="outline" onClick={() => router.push('/calendar')}>
          <X className="h-4 w-4 mr-1" />닫기
        </Button>
      </div>

      {totalPending > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white text-sm font-bold shrink-0">{totalPending}</span>
          <div className="text-sm text-red-700 dark:text-red-300 flex flex-wrap gap-x-4">
            {pendingVac.length > 0 && <span>휴가 신청 대기 <strong>{pendingVac.length}건</strong></span>}
            {pendingCancel.length > 0 && <span>휴가 취소 대기 <strong>{pendingCancel.length}건</strong></span>}
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="requests">
            신청 결재 {pendingVac.length > 0 && <span className="ml-1 text-xs bg-orange-500 text-white rounded-full px-1.5">{pendingVac.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="cancels">
            취소 결재 {pendingCancel.length > 0 && <span className="ml-1 text-xs bg-orange-500 text-white rounded-full px-1.5">{pendingCancel.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="employees">직원 휴가 ({employees.length})</TabsTrigger>
        </TabsList>

        {/* 휴가 신청 결재 */}
        <TabsContent value="requests">
          {pendingVac.length === 0 ? (
            <p className="text-sm text-[#9CA3AF] text-center py-8">대기 중인 신청이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pendingVac.map(req => (
                <div key={req.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <UserAvatar name={req.requester?.full_name ?? ''} color={req.requester?.color ?? '#6B7280'} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dark:text-[#F1F5F9]">{req.requester?.full_name ?? '(알 수 없음)'}</p>
                    <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                      <Sun className="inline h-3 w-3 mr-1 text-orange-500" />
                      {req.title} · {fmtRange(req.start_at, req.end_at, req.is_all_day)}
                      {!req.is_all_day && ' (반차)'}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => handleVacAction(req.id, 'approve')} disabled={processing === req.id}>
                    <Check className="h-3.5 w-3.5 mr-1" />승인
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleVacAction(req.id, 'reject')} disabled={processing === req.id}>
                    <X className="h-3.5 w-3.5 mr-1" />거부
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 휴가 취소 결재 */}
        <TabsContent value="cancels">
          {pendingCancel.length === 0 ? (
            <p className="text-sm text-[#9CA3AF] text-center py-8">대기 중인 취소 요청이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {pendingCancel.map(req => {
                const title = req.event?.title ?? req.event_title ?? '(휴가)'
                const startAt = req.event?.start_at ?? req.event_start_at
                const endAt = req.event?.end_at ?? req.event_end_at
                const allDay = req.event?.is_all_day ?? req.event_is_all_day ?? true
                return (
                  <div key={req.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3">
                    <UserAvatar name={req.requester?.full_name ?? ''} color={req.requester?.color ?? '#6B7280'} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium dark:text-[#F1F5F9]">{req.requester?.full_name ?? '(알 수 없음)'}</p>
                      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                        <Sun className="inline h-3 w-3 mr-1 text-orange-500" />
                        {title}{startAt && endAt ? ` · ${fmtRange(startAt, endAt, allDay)}` : ''}
                      </p>
                      {req.reason && <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] mt-0.5">사유: {req.reason}</p>}
                    </div>
                    <Button size="sm" onClick={() => handleCancelAction(req.id, 'approve')} disabled={processing === req.id}>
                      <Check className="h-3.5 w-3.5 mr-1" />승인
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleCancelAction(req.id, 'reject')} disabled={processing === req.id}>
                      <X className="h-3.5 w-3.5 mr-1" />거부
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* 직원 휴가 — 본인이 결재자인 직원 목록 + 휴가 잔여/총휴가 편집 + 처리 이력
            (사장님 팀 / 앱관리자는 전직원이 표시됨) */}
        <TabsContent value="employees">
          {employees.length === 0 ? (
            <p className="text-sm text-[#9CA3AF] text-center py-8">표시할 직원이 없습니다. 앱관리자에게 결재자 지정을 요청하세요.</p>
          ) : (
            <div className="space-y-2">
              {employees.map(e => (
                <div key={e.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <UserAvatar name={e.full_name} color={e.color} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dark:text-[#F1F5F9]">{e.full_name}</p>
                    <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                      사용 {e.used_days}일 · 대기 {e.pending_days}일 · 잔여 <strong>{e.remaining_days}일</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">총휴가</span>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      max={365}
                      value={vacEdits[e.id] ?? e.total_days}
                      onChange={ev => {
                        const v = ev.target.value
                        setVacEdits(prev => ({
                          ...prev,
                          [e.id]: v === '' ? 0 : Math.round(Number(v) * 10) / 10,
                        }))
                      }}
                      className="w-20 h-8 text-xs"
                    />
                    <Button size="sm" disabled={vacSaving === e.id || (vacEdits[e.id] ?? e.total_days) === e.total_days} onClick={() => saveTotalDays(e.id)}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {vacSaving === e.id ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 휴가 처리 이력 — 결재자 범위.
              사장님 팀은 결재자가 아니므로 (요청대로) 이력 섹션 자체를 숨긴다. */}
          {!isPresidentTeam && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className="w-full flex items-center justify-between text-sm font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#D1D5DB] transition-colors mb-2"
            >
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" />
                휴가 처리 이력
                <span className="text-xs bg-[#E5E7EB] dark:bg-[#374151] text-[#374151] dark:text-[#D1D5DB] rounded-full px-1.5">
                  {historyItems.length}건
                </span>
              </span>
              {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {historyOpen && (
              historyItems.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] dark:text-[#6B7280] bg-[#F9FAFB] dark:bg-[#1E293B]/40 border border-dashed border-[#E5E7EB] dark:border-[#334155] rounded-lg px-4 py-6 text-center">
                  아직 처리 이력이 없습니다.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {historyItems.map(item => {
                    const sd = item.event_start_at
                      ? (item.event_is_all_day ? format(parseISO(item.event_start_at), 'M월 d일', { locale: ko }) : format(parseISO(item.event_start_at), 'M월 d일 HH:mm', { locale: ko }))
                      : '-'
                    const ed = item.event_end_at
                      ? (item.event_is_all_day ? format(parseISO(item.event_end_at), 'M월 d일', { locale: ko }) : format(parseISO(item.event_end_at), 'HH:mm'))
                      : ''
                    const happenedLabel = item.happened_at ? format(parseISO(item.happened_at), 'yyyy.M.d HH:mm', { locale: ko }) : '-'
                    const timeLabel = (item.kind === 'grant' || item.kind === 'request_rejected') ? '승인 시간' : '취소 시간'
                    const k = item.kind === 'grant'
                      ? { badge: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40', label: '휴가 승인', icon: <CheckCircle className="h-3 w-3" /> }
                      : item.kind === 'cancel_approved'
                      ? { badge: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40', label: '취소 승인', icon: <CheckCircle className="h-3 w-3" /> }
                      : item.kind === 'cancel_rejected'
                      ? { badge: 'text-[#6B7280] dark:text-[#94A3B8] bg-[#F3F4F6] dark:bg-[#374151]', label: '취소 거부', icon: <XCircle className="h-3 w-3" /> }
                      : { badge: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40', label: '신청 거부', icon: <XCircle className="h-3 w-3" /> }
                    return (
                      <div key={item.id} className="bg-white dark:bg-[#1E293B] rounded-lg px-3 py-2 border border-[#E5E7EB] dark:border-[#334155] flex flex-wrap items-center gap-2">
                        <UserAvatar name={item.requester?.full_name ?? ''} color={item.requester?.color ?? '#6B7280'} size={24} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs dark:text-[#F1F5F9] truncate">
                            <span className="font-medium">{item.requester?.full_name}</span>
                            <span className="text-[#6B7280] dark:text-[#94A3B8]"> · {item.event_title} · {sd}{ed && sd !== ed && ` ~ ${ed}`}</span>
                          </p>
                          <p className="text-[10px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">
                            <span className="font-medium">{timeLabel}:</span> {happenedLabel}
                            {item.reviewer?.full_name && ` · ${item.reviewer.full_name}`}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${k.badge}`}>
                          {k.icon}{k.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
          )}
        </TabsContent>
      </Tabs>

      {(() => {
        const finishApprove = () => {
          setApproveDone(null)
          setHistoryOpen(false)
          // 결과 확인을 위해 직원 휴가 탭으로 전환
          setActiveTab('employees')
          fetchAll()
          window.dispatchEvent(new CustomEvent('vacation-cancel-approved'))
        }
        return (
          <Dialog open={approveDone !== null} onOpenChange={open => { if (!open) finishApprove() }}>
            <DialogContent className="max-w-xs text-center">
              <DialogHeader>
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40">
                    <CheckCircle className="h-9 w-9 text-green-500" />
                  </div>
                  <DialogTitle className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">승인 완료</DialogTitle>
                  <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                    {approveDone === 'cancel' ? '휴가 취소가 승인되었습니다.' : '휴가 신청이 승인되었습니다.'}
                  </p>
                  <Button className="w-full mt-2" onClick={finishApprove}>확인</Button>
                </div>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        )
      })()}

      {ToastComponent}
    </div>
  )
}
