'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sun, ClipboardCheck, Users, CheckCircle } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'

interface CancelReq {
  id: string
  status: string
  requester: { id: string; full_name: string; color: string } | null
  event: { id: string; title: string; start_at: string; is_all_day: boolean } | null
}

interface VacReq {
  id: string
  status: string
  title: string
  start_at: string
  is_all_day: boolean
  requester: { id: string; full_name: string; color: string } | null
}

interface Employee { id: string; full_name: string; color: string }

// 결재자(관리자) 전용 사이드바.
// 본인이 결재자(approver_id == me)로 지정된 직원의 휴가 신청·취소만 표시한다.
export function ApproverSidebar() {
  const [pendingCancels, setPendingCancels] = useState<CancelReq[]>([])
  const [pendingVacReqs, setPendingVacReqs] = useState<VacReq[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [processing, setProcessing] = useState<string | null>(null)
  const [approveDone, setApproveDone] = useState<null | 'cancel' | 'vac'>(null)

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/vacation/approver')
    if (!res.ok) return
    const data = await res.json()
    setEmployees(Array.isArray(data.employees) ? data.employees : [])
    setPendingCancels(
      (Array.isArray(data.cancel_requests) ? data.cancel_requests : []).filter((r: CancelReq) => r.status === 'pending')
    )
    setPendingVacReqs(
      (Array.isArray(data.vacation_requests) ? data.vacation_requests : []).filter((r: VacReq) => r.status === 'pending')
    )
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('approver-sidebar-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_cancel_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_requests' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const approveCancel = async (id: string) => {
    setProcessing(id)
    const res = await fetch(`/api/vacation-cancel-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    setProcessing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert((data as any).error ?? '처리에 실패했습니다.')
      return
    }
    setApproveDone('cancel')
  }

  const approveVac = async (id: string) => {
    setProcessing(id)
    const res = await fetch(`/api/vacation/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    setProcessing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert((data as any).error ?? '처리에 실패했습니다.')
      return
    }
    setApproveDone('vac')
  }

  const closeApproveDone = useCallback(() => {
    setApproveDone(null)
    fetchAll()
    window.dispatchEvent(new CustomEvent('vacation-cancel-approved'))
  }, [fetchAll])

  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 bg-[#F8FAFC] border-l border-[#E5E7EB] p-4 gap-4 overflow-y-auto dark:bg-[#2D3440] dark:border-[#4B5563]">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
        <h2 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider dark:text-[#94A3B8]">결재함</h2>
      </div>

      {/* 휴가 신청 대기 */}
      <div>
        <h3 className="text-xs font-semibold text-[#374151] mb-2 flex items-center gap-1 dark:text-[#D1D5DB]">
          <Sun className="h-3.5 w-3.5 text-orange-500" />
          휴가 신청 대기
          {pendingVacReqs.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#EF4444] text-white text-[10px] font-bold">
              {pendingVacReqs.length}
            </span>
          )}
        </h3>
        {pendingVacReqs.length === 0 ? (
          <p className="text-[10px] text-[#9CA3AF] dark:text-[#6B7280]">대기 중인 신청이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {pendingVacReqs.slice(0, 5).map(req => (
              <li key={req.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-orange-200 dark:bg-[#374151] dark:border-orange-800">
                <UserAvatar name={req.requester?.full_name ?? ''} color={req.requester?.color ?? '#6B7280'} size={24} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#111827] truncate dark:text-[#F1F5F9]">{req.requester?.full_name ?? '(알 수 없음)'}</p>
                  <p className="text-[10px] text-[#6B7280] dark:text-[#94A3B8] truncate">
                    {format(parseISO(req.start_at), 'M/d', { locale: ko })}
                  </p>
                </div>
                <button
                  onClick={() => approveVac(req.id)}
                  disabled={processing === req.id}
                  className="text-[10px] font-medium text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded px-1.5 py-0.5 shrink-0 transition-colors"
                  title="승인"
                >
                  {processing === req.id ? '…' : '승인'}
                </button>
              </li>
            ))}
            {pendingVacReqs.length > 5 && (
              <li className="text-[10px] text-[#9CA3AF] text-center pt-1">외 {pendingVacReqs.length - 5}건</li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-[#E5E7EB] dark:border-[#4B5563]" />

      {/* 휴가 취소 대기 */}
      <div>
        <h3 className="text-xs font-semibold text-[#374151] mb-2 flex items-center gap-1 dark:text-[#D1D5DB]">
          <Sun className="h-3.5 w-3.5 text-orange-500" />
          휴가 취소 대기
          {pendingCancels.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#EF4444] text-white text-[10px] font-bold">
              {pendingCancels.length}
            </span>
          )}
        </h3>
        {pendingCancels.length === 0 ? (
          <p className="text-[10px] text-[#9CA3AF] dark:text-[#6B7280]">대기 중인 취소 요청이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {pendingCancels.slice(0, 5).map(req => (
              <li key={req.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-orange-200 dark:bg-[#374151] dark:border-orange-800">
                <UserAvatar name={req.requester?.full_name ?? ''} color={req.requester?.color ?? '#6B7280'} size={24} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#111827] truncate dark:text-[#F1F5F9]">{req.requester?.full_name ?? '(알 수 없음)'}</p>
                  {req.event && (
                    <p className="text-[10px] text-[#6B7280] dark:text-[#94A3B8] truncate">
                      {format(parseISO(req.event.start_at), 'M/d', { locale: ko })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => approveCancel(req.id)}
                  disabled={processing === req.id}
                  className="text-[10px] font-medium text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded px-1.5 py-0.5 shrink-0 transition-colors"
                  title="승인"
                >
                  {processing === req.id ? '…' : '승인'}
                </button>
              </li>
            ))}
            {pendingCancels.length > 5 && (
              <li className="text-[10px] text-[#9CA3AF] text-center pt-1">외 {pendingCancels.length - 5}건</li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-[#E5E7EB] dark:border-[#4B5563]" />

      <div>
        <h3 className="text-xs font-semibold text-[#374151] mb-2 flex items-center gap-1 dark:text-[#D1D5DB]">
          <Users className="h-3.5 w-3.5" />
          내 결재 직원 ({employees.length})
        </h3>
        {employees.length === 0 ? (
          <p className="text-[10px] text-[#9CA3AF] dark:text-[#6B7280]">결재 지정된 직원이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {employees.map(e => (
              <li key={e.id} className="flex items-center gap-2 text-xs">
                <UserAvatar name={e.full_name} color={e.color} size={20} />
                <span className="truncate dark:text-[#F1F5F9]">{e.full_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/approvals"
        className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-[#2563EB] text-[#2563EB] text-xs font-medium py-2 px-3 hover:bg-[#EFF6FF] transition-colors dark:border-[#3B82F6] dark:text-[#60A5FA] dark:hover:bg-[#1E3A5F]"
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        결재함 열기
      </Link>

      <Dialog open={approveDone !== null} onOpenChange={open => { if (!open) closeApproveDone() }}>
        <DialogContent className="max-w-xs text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40">
              <CheckCircle className="h-9 w-9 text-green-500" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">승인 완료</DialogTitle>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
              {approveDone === 'cancel' ? '휴가 취소가 승인되었습니다.' : '휴가 신청이 승인되었습니다.'}
            </p>
            <Button className="w-full mt-2" onClick={closeApproveDone}>확인</Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
