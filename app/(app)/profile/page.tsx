'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Eye, EyeOff, KeyRound, Sun, CalendarDays,
  CheckCircle2, Clock, Wifi, Settings, Lock, Monitor,
  IdCard, Users, Save, CheckCircle, XCircle, ClipboardList, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, UserCheck,
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { USER_COLOR_PALETTE } from '@/types/app'
import { cn } from '@/lib/utils/cn'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { ProfileWithTeam, Team } from '@/types/app'
import { useProfile, useTeams, useVacationOwn, useApproverData, useVacationHistory, invalidate } from '@/lib/hooks/use-shared-data'

const ROLE_LABEL: Record<string, string> = { admin: '앱관리자', manager: '관리자', member: '실무자' }

function displayRoleLabel(p: { role?: string | null; is_super_admin?: boolean | null }): string {
  if ((p as any).is_super_admin) return '앱관리자'
  if (p.role === 'manager') return '관리자'
  if (p.role === 'admin') return '앱관리자'
  if (p.role === 'member') return '실무자'
  return ''
}

type TabKey = '설정' | '출근' | '휴가' | '인사관리' | '비밀번호'

interface VacHistory {
  id: string
  title: string
  start_date: string
  end_date: string
  days: number
}

interface VacSummary {
  year: number
  total_days: number
  used_days: number
  remaining_days: number
  history: VacHistory[]
}

interface ApproverEmployee {
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

interface VacationRequest {
  id: string
  requested_by: string
  approver_id: string | null
  title: string
  description: string | null
  start_at: string
  end_at: string
  is_all_day: boolean
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  reviewed_at: string | null
  created_at: string
  requester?: { id: string; full_name: string; color: string; approver_id: string | null }
  approver?: { id: string; full_name: string; color: string } | null
  reviewer?: { id: string; full_name: string; color: string } | null
}

interface ApproverCancelRequest {
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
  requester: { id: string; full_name: string; color: string }
  reviewer: { id: string; full_name: string; color: string } | null
  event: { id: string; title: string; start_at: string; end_at: string; is_all_day: boolean } | null
}

interface ApproverData {
  employees: ApproverEmployee[]
  cancel_requests: ApproverCancelRequest[]
  vacation_requests: VacationRequest[]
}

interface VacHistoryItem {
  id: string
  kind: 'grant' | 'cancel_approved' | 'cancel_rejected' | 'request_rejected'
  happened_at: string
  requester: { id: string; full_name: string; color: string; approver_id: string | null }
  event_title: string
  event_start_at: string | null
  event_end_at: string | null
  event_is_all_day: boolean
  reviewer: { id: string; full_name: string; color: string } | null
  reason: string | null
}

interface VacSummaryV2 extends VacSummary {
  pending_days?: number
  pending_requests?: Array<{
    id: string
    title: string
    start_at: string
    end_at: string
    is_all_day: boolean
    created_at: string
    approver: { id: string; full_name: string; color: string } | null
    days: number
  }>
}

interface CompanySettings {
  address: string
  latitude: number | null
  longitude: number | null
  radius_meters: number
  attendance_method: 'gps' | 'ip'
  require_device_approval: boolean
}

interface DeviceStatus {
  id: string
  device_label: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  decided_at: string | null
}

type IpStatus = 'idle' | 'checking' | 'allowed' | 'denied'

function getLocalDateStr(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  return kst.toISOString().slice(0, 10)
}

function InfoRow({
  label,
  value,
  muted,
  accent,
}: {
  label: string
  value: string
  muted?: boolean
  accent?: 'blue' | 'green'
}) {
  const accentClass =
    accent === 'blue'
      ? 'text-[#2563EB] dark:text-[#60A5FA] font-medium'
      : accent === 'green'
      ? 'text-green-600 dark:text-green-400 font-medium'
      : muted
      ? 'text-[#9CA3AF] dark:text-[#64748B]'
      : 'text-[#111827] dark:text-[#F1F5F9]'
  return (
    <div className="flex items-center justify-between text-sm border-b border-[#F3F4F6] dark:border-[#334155] pb-2 last:border-0 last:pb-0">
      <span className="text-[#6B7280] dark:text-[#94A3B8]">{label}</span>
      <span className={accentClass}>{value}</span>
    </div>
  )
}

const TABS: { key: TabKey; icon: React.ReactNode; label: string }[] = [
  { key: '설정',      icon: <Settings className="h-3.5 w-3.5" />,      label: '설정' },
  { key: '출근',      icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: '출근' },
  { key: '휴가',      icon: <Sun className="h-3.5 w-3.5" />,           label: '휴가' },
  { key: '인사관리',  icon: <IdCard className="h-3.5 w-3.5" />,        label: '인사관리' },
  { key: '비밀번호',  icon: <Lock className="h-3.5 w-3.5" />,          label: '비밀번호' },
]

export default function ProfilePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('설정')
  const [profile, setProfile] = useState<ProfileWithTeam | null>(null)
  const [email, setEmail] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [form, setForm] = useState({ full_name: '', color: '', team_id: 'none' })
  const [loading, setLoading] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })
  const [vacSummary, setVacSummary] = useState<VacSummaryV2 | null>(null)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  const [empRequestProcessing, setEmpRequestProcessing] = useState<string | null>(null)
  const [approveComplete, setApproveComplete] = useState<{ kind: 'cancel' | 'request' } | null>(null)
  const [approverData, setApproverData] = useState<ApproverData | null>(null)
  const [empTotalEdits, setEmpTotalEdits] = useState<Record<string, number>>({})
  const [empSaving, setEmpSaving] = useState<string | null>(null)
  const [empCancelProcessing, setEmpCancelProcessing] = useState<string | null>(null)
  const [empHistoryOpen, setEmpHistoryOpen] = useState(false)
  const [empHistory, setEmpHistory] = useState<VacHistoryItem[]>([])
  const [ipStatus, setIpStatus] = useState<IpStatus>('idle')
  const [currentIp, setCurrentIp] = useState<string | null>(null)
  const [viewedDate, setViewedDate] = useState<string>(getLocalDateStr())
  const [viewedAttendance, setViewedAttendance] = useState<{ checked_in_at: string; checked_out_at?: string | null; method?: string } | null>(null)
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)

  // 결재자(관리 직원 보유) 가 토글로 보는 직원별 출근 섹션
  const [empAttOpen, setEmpAttOpen] = useState(false)
  const [empAttDate, setEmpAttDate] = useState<string>(getLocalDateStr())
  const [empAttLoading, setEmpAttLoading] = useState(false)
  const [empAttRecords, setEmpAttRecords] = useState<Array<{
    id: string
    full_name: string
    color: string
    team_name: string | null
    checked_in_at: string | null
    checked_out_at: string | null
    method: string | null
  }>>([])
  const [device, setDevice] = useState<DeviceStatus | null>(null)
  const [deviceRegistering, setDeviceRegistering] = useState(false)
  const [hrRecord, setHrRecord] = useState<{
    hire_date: string | null
    employee_no: string | null
    birth_date: string | null
    phone: string | null
    emergency_contact: string | null
    address: string | null
    notes: string | null
    education: string[] | null
    career: string[] | null
    certificates: string[] | null
  } | null>(null)
  const { showToast, ToastComponent } = useToast()

  const checkIp = async () => {
    setIpStatus('checking')
    try {
      const res = await fetch('/api/attendance/ip-check')
      const data = await res.json()
      setCurrentIp(data.ip ?? null)
      setIpStatus(data.allowed ? 'allowed' : 'denied')
      setDevice(data.device ?? null)
    } catch {
      setCurrentIp(null)
      setIpStatus('denied')
    }
  }

  const requestDeviceRegistration = async () => {
    setDeviceRegistering(true)
    const label = window.prompt('이 PC를 어떤 이름으로 등록할까요? (예: 회의실 PC, 내 자리 PC)') ?? ''
    if (label === '') { setDeviceRegistering(false); return }
    const res = await fetch('/api/attendance/device-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_label: label }),
    })
    setDeviceRegistering(false)
    if (res.ok) {
      const data = await res.json()
      setDevice(data)
      showToast('PC 등록 요청을 보냈습니다. 관리자 승인을 기다려 주세요.', 'success')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'PC 등록 요청에 실패했습니다.', 'error')
    }
  }

  // SWR 기반 — 액션 후 캐시 무효화 한 번이면 위쪽의 hook 들이 자동 reload
  const fetchApproverData = () => invalidate.vacationFamily()

  const fetchOwnVacation = async () => {
    const res = await fetch('/api/vacation')
    if (res.ok) setVacSummary(await res.json())
  }

  // ── 공용 데이터: SWR 로 dedupe (다른 컴포넌트 호출과 30s 내 합산 1회) ──
  const { data: profileSwr } = useProfile()
  const { data: teamsSwr } = useTeams()
  const { data: vacSwr } = useVacationOwn()
  const { data: approverSwr } = useApproverData()
  const { data: vacHistorySwr } = useVacationHistory()

  useEffect(() => {
    if (!profileSwr) return
    const p = profileSwr as ProfileWithTeam
    setProfile(p)
    setForm({ full_name: p.full_name, color: p.color, team_id: p.team_id ?? 'none' })
  }, [profileSwr])
  useEffect(() => { if (Array.isArray(teamsSwr)) setTeams(teamsSwr as Team[]) }, [teamsSwr])
  useEffect(() => {
    const v = vacSwr as any
    if (v && typeof v.total_days === 'number') setVacSummary(v)
  }, [vacSwr])
  useEffect(() => {
    if (!approverSwr) return
    const data = approverSwr as ApproverData
    setApproverData(data)
    const init: Record<string, number> = {}
    data.employees.forEach(e => { init[e.id] = e.total_days })
    setEmpTotalEdits(init)
  }, [approverSwr])
  useEffect(() => {
    if (Array.isArray(vacHistorySwr)) setEmpHistory(vacHistorySwr as VacHistoryItem[])
  }, [vacHistorySwr])

  // ── 페이지 전용 fetch (캐시 불필요): 이메일·설정·오늘 출근·인사기록·퇴근보정 ──
  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    })
    const todayStr = getLocalDateStr()
    Promise.all([
      fetch('/api/admin/settings').then(r => r.json()),
      fetch(`/api/attendance?date=${todayStr}`, { cache: 'no-store' }).then(r => r.json()),
    ]).then(([settingsData, attendanceData]: [
      CompanySettings, { checked_in_at: string; checked_out_at?: string | null; method?: string } | null
    ]) => {
      setCompanySettings(settingsData)
      setViewedAttendance(attendanceData)
      if (settingsData && !attendanceData) checkIp()
    })
    fetch('/api/hr-records').then(r => r.ok ? r.json() : null).then(setHrRecord).catch(() => {})
    // 어제 이전 출근 행 중 퇴근 미입력 건은 18:00(KST)로 자동 보정 — best-effort
    fetch('/api/attendance/checkout', { method: 'PATCH' }).catch(() => {})
  }, [])

  const saveEmployeeTotal = async (userId: string) => {
    const total = empTotalEdits[userId]
    if (total === undefined) return
    setEmpSaving(userId)
    const res = await fetch(`/api/admin/vacation/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_days: total }),
    })
    setEmpSaving(null)
    if (res.ok) {
      showToast('저장되었습니다.', 'success')
      fetchApproverData()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '저장에 실패했습니다.', 'error')
    }
  }

  const handleEmployeeCancelAction = async (id: string, action: 'approve' | 'reject') => {
    setEmpCancelProcessing(id)
    const res = await fetch(`/api/vacation-cancel-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setEmpCancelProcessing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '처리에 실패했습니다.', 'error')
      return
    }
    if (action === 'approve') {
      setApproveComplete({ kind: 'cancel' })
    } else {
      showToast('취소를 거부했습니다.', 'success')
      fetchApproverData()
    }
  }

  const handleEmployeeRequestAction = async (id: string, action: 'approve' | 'reject') => {
    setEmpRequestProcessing(id)
    let reject_reason: string | null = null
    if (action === 'reject') {
      const r = window.prompt('거부 사유를 입력해 주세요. (선택)')
      reject_reason = r ?? null
    }
    const res = await fetch(`/api/vacation/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reject_reason }),
    })
    setEmpRequestProcessing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '처리에 실패했습니다.', 'error')
      return
    }
    if (action === 'approve') {
      setApproveComplete({ kind: 'request' })
    } else {
      showToast('휴가 신청을 거부했습니다.', 'success')
      fetchApproverData()
    }
  }

  const handleWithdrawRequest = async (id: string) => {
    if (!window.confirm('이 휴가 신청을 철회하시겠습니까?')) return
    setWithdrawing(id)
    const res = await fetch(`/api/vacation/requests/${id}`, { method: 'DELETE' })
    setWithdrawing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '철회에 실패했습니다.', 'error')
      return
    }
    showToast('휴가 신청이 철회되었습니다.', 'success')
    fetchOwnVacation()
  }

  // 표시 중인 날짜의 출근 행을 서버에서 다시 가져오기
  const refetchViewedAttendance = useCallback(async (dateOverride?: string) => {
    const dateStr = dateOverride ?? viewedDate
    try {
      const res = await fetch(`/api/attendance?date=${dateStr}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setViewedAttendance(data)
      }
    } catch (e) {
      console.error('refetchViewedAttendance failed', e)
    }
  }, [viewedDate])

  // 출근 탭 진입 시 또는 보고 있는 날짜가 바뀔 때마다 새로고침
  useEffect(() => {
    if (activeTab === '출근') {
      refetchViewedAttendance()
      // 출근/퇴근 어느 단계든 사무실 네트워크 매칭 여부가 필요하므로 자동 점검
      if (ipStatus === 'idle') checkIp()
    }
  }, [activeTab, viewedDate, refetchViewedAttendance]) // eslint-disable-line react-hooks/exhaustive-deps

  // 직원 출근 관리 섹션 — 토글이 열려 있고 출근 탭에 있을 때 날짜 변경 시 갱신
  const fetchEmpAttendance = useCallback(async (date: string) => {
    setEmpAttLoading(true)
    try {
      const res = await fetch(`/api/attendance/approver?date=${date}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setEmpAttRecords(Array.isArray(data.records) ? data.records : [])
      } else {
        setEmpAttRecords([])
      }
    } finally {
      setEmpAttLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === '출근' && empAttOpen) {
      fetchEmpAttendance(empAttDate)
    }
  }, [activeTab, empAttOpen, empAttDate, fetchEmpAttendance])

  const [checkingOut, setCheckingOut] = useState(false)
  const handleCheckOut = async () => {
    setCheckingOut(true)
    const todayStr = getLocalDateStr()
    const res = await fetch('/api/attendance/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr }),
    })
    const data = await res.json()
    setCheckingOut(false)
    if (res.ok) {
      setViewedAttendance(prev => prev ? { ...prev, checked_out_at: data.checked_out_at ?? new Date().toISOString() } : prev)
      showToast('퇴근이 확인되었습니다. 수고하셨습니다.', 'success')
      refetchViewedAttendance(getLocalDateStr())
    } else {
      if (data.current_ip) setCurrentIp(data.current_ip)
      if (res.status === 403) setIpStatus('denied')
      showToast(data.error ?? '퇴근 확인에 실패했습니다.', 'error')
    }
  }

  const handleCheckIn = async () => {
    setCheckingIn(true)
    const todayStr = getLocalDateStr()
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr }),
    })
    const data = await res.json()
    if (res.ok) {
      // POST 응답을 즉시 반영
      setViewedAttendance({ checked_in_at: data.checked_in_at, checked_out_at: data.checked_out_at ?? null, method: data.method })
      showToast('출근이 확인되었습니다.', 'success')
      // 서버에서 한 번 더 확인해 상태 영속성 보장
      refetchViewedAttendance(getLocalDateStr())
    } else if (res.status === 409) {
      setViewedAttendance({ checked_in_at: data.checked_in_at, checked_out_at: data.checked_out_at ?? null, method: data.method })
      showToast('이미 출근 처리되었습니다.', 'success')
      refetchViewedAttendance(getLocalDateStr())
    } else {
      if (data.current_ip) setCurrentIp(data.current_ip)
      if (res.status === 403) setIpStatus('denied')
      const msg = data.current_ip
        ? `${data.error ?? '출근 확인에 실패했습니다.'} (현재 IP: ${data.current_ip})`
        : (data.error ?? '출근 확인에 실패했습니다.')
      showToast(msg, 'error')
    }
    setCheckingIn(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/profiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: form.full_name,
        color: form.color,
        team_id: form.team_id === 'none' ? null : form.team_id,
      }),
    })
    if (res.ok) {
      showToast('프로필이 저장되었습니다.', 'success')
      setTimeout(() => { router.refresh(); router.back() }, 600)
    } else {
      showToast('저장에 실패했습니다.', 'error')
    }
    setLoading(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) { showToast('새 비밀번호가 일치하지 않습니다.', 'error'); return }
    if (pwForm.next.length < 6) { showToast('새 비밀번호는 6자 이상이어야 합니다.', 'error'); return }
    setPwLoading(true)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
    })
    const data = await res.json()
    if (res.ok) {
      showToast('비밀번호가 변경되었습니다.', 'success')
      setPwForm({ current: '', next: '', confirm: '' })
    } else {
      showToast(data.error ?? '변경에 실패했습니다.', 'error')
    }
    setPwLoading(false)
  }

  const handleCancel = () => {
    if (profile) setForm({ full_name: profile.full_name, color: profile.color, team_id: profile.team_id ?? 'none' })
    router.back()
  }

  if (!profile) return <div className="p-4 text-center text-[#6B7280]">불러오는 중...</div>

  const vacPct = vacSummary && vacSummary.total_days > 0
    ? Math.min((vacSummary.used_days / vacSummary.total_days) * 100, 100)
    : 0

  const checkedInTime = viewedAttendance?.checked_in_at
    ? format(new Date(viewedAttendance.checked_in_at), 'HH:mm')
    : null
  const isViewingToday = viewedDate === getLocalDateStr()

  return (
    <div className="p-4 max-w-md mx-auto">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9]">프로필</h1>
        <Button variant="outline" size="sm" onClick={handleCancel}>
          <X className="h-4 w-4 mr-1" />닫기
        </Button>
      </div>

      {/* 프로필 헤더 — 항상 표시 */}
      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-4 mb-4 flex items-center gap-3">
        <UserAvatar name={form.full_name || profile.full_name} color={form.color} size={52} />
        <div className="min-w-0">
          <p className="font-semibold text-[#111827] dark:text-[#F1F5F9] truncate">{form.full_name || profile.full_name}</p>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
            {displayRoleLabel(profile as any)}
            {profile.team ? ` · ${(profile.team as any).name}` : ''}
          </p>
          <p className="text-xs text-[#9CA3AF] dark:text-[#64748B] truncate">{email}</p>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex bg-[#F3F4F6] dark:bg-[#0F172A] rounded-xl p-1 mb-4 gap-1">
        {TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-all',
              activeTab === key
                ? 'bg-white dark:bg-[#1E293B] text-[#111827] dark:text-[#F1F5F9] shadow-sm'
                : 'text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── 설정 탭 ── */}
      {activeTab === '설정' && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">이름</label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">내 색상</label>
              <div className="grid grid-cols-6 gap-2">
                {USER_COLOR_PALETTE.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color }))}
                    className={cn('w-8 h-8 rounded-full transition-transform hover:scale-110', form.color === color && 'ring-2 ring-offset-2 ring-[#2563EB] scale-110')}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">소속 팀</label>
              <Select value={form.team_id} onValueChange={v => setForm(f => ({ ...f, team_id: v }))}>
                <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">팀 없음</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>취소</Button>
              <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── 출근 탭 ── */}
      {activeTab === '출근' && (
        <div className="space-y-4">
          {/* 본인 출근/퇴근 카드 */}
          <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
            {companySettings === null ? (
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-4">불러오는 중...</p>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Wifi className="h-4 w-4 text-blue-500" />
                  <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">
                    {isViewingToday ? '오늘 출근 확인' : '출근 기록'}
                  </h2>
                </div>

                {/* 날짜 네비게이터 — 과거 날짜 조회 */}
                <div className="flex items-center gap-1 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => {
                      const d = new Date(viewedDate + 'T00:00:00')
                      d.setDate(d.getDate() - 1)
                      setViewedDate(d.toLocaleDateString('sv-SE'))
                    }}
                    title="이전 날짜"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    type="date"
                    value={viewedDate}
                    max={getLocalDateStr()}
                    onChange={e => setViewedDate(e.target.value || getLocalDateStr())}
                    className="h-8 text-sm flex-1 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => {
                      const d = new Date(viewedDate + 'T00:00:00')
                      d.setDate(d.getDate() + 1)
                      const next = d.toLocaleDateString('sv-SE')
                      if (next <= getLocalDateStr()) setViewedDate(next)
                    }}
                    disabled={viewedDate >= getLocalDateStr()}
                    title="다음 날짜"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {!isViewingToday && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setViewedDate(getLocalDateStr())}
                    >
                      오늘
                    </Button>
                  )}
                </div>

                {/* 선택 날짜의 본인 출근/퇴근 표시 */}
                {checkedInTime ? (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3 space-y-1 mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                      <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                        {isViewingToday ? '출근이 확인되었습니다' : `${viewedDate.replace(/-/g, '.')} 출근 기록`}
                      </p>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-7">
                      <Clock className="h-3 w-3" />
                      🖥️ 출근 · {checkedInTime}
                    </p>
                    {viewedAttendance?.checked_out_at ? (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-7">
                        <Clock className="h-3 w-3" />
                        🏠 퇴근 · {format(new Date(viewedAttendance.checked_out_at), 'HH:mm')}
                      </p>
                    ) : !isViewingToday ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 ml-7">
                        <Clock className="h-3 w-3" />
                        🏠 퇴근 기록 없음
                      </p>
                    ) : null}
                  </div>
                ) : (
                  !isViewingToday && (
                    <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] px-4 py-3 text-sm text-[#6B7280] dark:text-[#94A3B8] text-center mb-3">
                      {viewedDate.replace(/-/g, '.')} 출근 기록이 없습니다.
                    </div>
                  )
                )}

                {/* 오늘 + 미출근: 출근 흐름 */}
                {isViewingToday && !checkedInTime && (
                  <div className="space-y-3">
                    {ipStatus === 'checking' && (
                      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2 animate-pulse">
                        네트워크 확인 중...
                      </p>
                    )}
                    {ipStatus === 'allowed' && (
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-2.5 text-sm flex items-center gap-2 text-green-700 dark:text-green-300">
                        <Wifi className="h-4 w-4 shrink-0" />사무실 네트워크에 연결되어 있습니다.
                      </div>
                    )}
                    {ipStatus === 'denied' && (
                      <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] px-4 py-2.5 text-sm flex items-start gap-2 text-[#6B7280] dark:text-[#94A3B8]">
                        <Wifi className="h-4 w-4 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p>사무실 네트워크가 아닙니다.</p>
                          {currentIp && (
                            <p className="text-[11px] mt-0.5 font-mono text-[#9CA3AF] dark:text-[#64748B]">
                              현재 IP: {currentIp}
                            </p>
                          )}
                          <p className="text-[11px] mt-0.5">사무실에서 접속 중인데 이 화면이 보이면 관리자에게 현재 IP 등록을 요청하세요.</p>
                        </div>
                      </div>
                    )}
                    {ipStatus === 'idle' && (
                      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
                        출근 확인 버튼을 눌러 네트워크를 확인하세요.
                      </p>
                    )}

                    {/* PC 등록 안내 — 사무실 IP일 때만 노출 */}
                    {ipStatus === 'allowed' && (
                      <div className="rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-[#F9FAFB] dark:bg-[#0F172A] px-3 py-2.5 text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-[#6B7280] dark:text-[#94A3B8]" />
                          <span className="font-medium text-[#374151] dark:text-[#D1D5DB]">이 PC 등록 상태</span>
                        </div>
                        {device === null && (
                          <>
                            <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
                              이 PC는 아직 등록되어 있지 않습니다. 사무실 외부에서 출근 체크가 필요하면 등록 요청을 보내 관리자 승인을 받으세요.
                            </p>
                            <Button type="button" size="sm" variant="outline" className="w-full h-7 text-xs" onClick={requestDeviceRegistration} disabled={deviceRegistering}>
                              <Monitor className="h-3 w-3 mr-1" />
                              {deviceRegistering ? '요청 중...' : 'PC 등록 요청'}
                            </Button>
                          </>
                        )}
                        {device?.status === 'pending' && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            승인 대기 중{device.device_label ? ` · ${device.device_label}` : ''}
                          </p>
                        )}
                        {device?.status === 'approved' && (
                          <p className="text-[11px] text-green-600 dark:text-green-400">
                            ✅ 등록 완료{device.device_label ? ` · ${device.device_label}` : ''}
                          </p>
                        )}
                        {device?.status === 'rejected' && (
                          <>
                            <p className="text-[11px] text-red-600 dark:text-red-400">
                              등록이 거절되었습니다. 다시 요청할 수 있습니다.
                            </p>
                            <Button type="button" size="sm" variant="outline" className="w-full h-7 text-xs" onClick={requestDeviceRegistration} disabled={deviceRegistering}>
                              <Monitor className="h-3 w-3 mr-1" />다시 요청
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="flex-none" onClick={checkIp} disabled={ipStatus === 'checking'}>
                        <Wifi className="h-3.5 w-3.5 mr-1" />재확인
                      </Button>
                      <Button
                        type="button"
                        className="flex-1"
                        disabled={ipStatus !== 'allowed' || checkingIn}
                        onClick={handleCheckIn}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />{checkingIn ? '처리 중...' : '출근 확인'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* 오늘 + 출근 완료 + 미퇴근: 퇴근 흐름 */}
                {isViewingToday && checkedInTime && !viewedAttendance?.checked_out_at && (
                  <div className="space-y-3">
                    {ipStatus === 'idle' && (
                      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
                        네트워크 확인 버튼을 눌러 퇴근 확인이 가능한지 확인하세요.
                      </p>
                    )}
                    {ipStatus === 'checking' && (
                      <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2 animate-pulse">
                        네트워크 확인 중...
                      </p>
                    )}
                    {ipStatus === 'denied' && (
                      <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] px-4 py-2.5 text-sm flex items-start gap-2 text-[#6B7280] dark:text-[#94A3B8]">
                        <Wifi className="h-4 w-4 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p>사무실 네트워크가 아닙니다. 퇴근 확인은 사무실 IP에서만 가능합니다.</p>
                          {currentIp && (
                            <p className="text-[11px] mt-0.5 font-mono text-[#9CA3AF] dark:text-[#64748B]">
                              현재 IP: {currentIp}
                            </p>
                          )}
                          <p className="text-[11px] mt-0.5">미입력 상태로 다음날이 되면 자동으로 18:00에 퇴근 처리됩니다.</p>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="flex-none" onClick={checkIp} disabled={ipStatus === 'checking'}>
                        <Wifi className="h-3.5 w-3.5 mr-1" />재확인
                      </Button>
                      <Button
                        type="button"
                        className="flex-1"
                        disabled={ipStatus !== 'allowed' || checkingOut}
                        onClick={handleCheckOut}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />{checkingOut ? '처리 중...' : '퇴근 확인'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] dark:text-[#64748B] text-center">
                      퇴근 확인을 입력하지 않으면 자동으로 18시로 기록됩니다.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 결재자 한정: 직원 출근 관리 토글 + 섹션 */}
          {(approverData?.employees?.length ?? 0) > 0 && (
            <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                onClick={() => setEmpAttOpen(o => !o)}
              >
                <span className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-[#2563EB]" />
                  직원 출근 관리
                  <span className="text-[10px] bg-[#EFF6FF] dark:bg-[#1E3A5F] text-[#2563EB] dark:text-[#93C5FD] rounded px-1.5 py-0.5">
                    {approverData?.employees?.length ?? 0}명
                  </span>
                </span>
                {empAttOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              {empAttOpen && (
                <div className="mt-4 space-y-3">
                  {/* 직원 섹션 날짜 네비게이터 */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        const d = new Date(empAttDate + 'T00:00:00')
                        d.setDate(d.getDate() - 1)
                        setEmpAttDate(d.toLocaleDateString('sv-SE'))
                      }}
                      title="이전 날짜"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Input
                      type="date"
                      value={empAttDate}
                      max={getLocalDateStr()}
                      onChange={e => setEmpAttDate(e.target.value || getLocalDateStr())}
                      className="h-8 text-sm flex-1 text-center"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        const d = new Date(empAttDate + 'T00:00:00')
                        d.setDate(d.getDate() + 1)
                        const next = d.toLocaleDateString('sv-SE')
                        if (next <= getLocalDateStr()) setEmpAttDate(next)
                      }}
                      disabled={empAttDate >= getLocalDateStr()}
                      title="다음 날짜"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {empAttDate !== getLocalDateStr() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setEmpAttDate(getLocalDateStr())}
                      >
                        오늘
                      </Button>
                    )}
                  </div>

                  {empAttLoading ? (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-4 animate-pulse">불러오는 중...</p>
                  ) : empAttRecords.length === 0 ? (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-4">
                      관리 직원이 없습니다.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {empAttRecords.map(r => (
                        <li
                          key={r.id}
                          className="bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-3 py-2.5 flex items-center gap-3"
                        >
                          <UserAvatar name={r.full_name} color={r.color} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9] truncate">
                              {r.full_name}
                            </p>
                            <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">
                              {r.team_name ?? '팀 없음'}
                            </p>
                          </div>
                          {r.checked_in_at ? (
                            <div className="text-right text-[11px] leading-tight">
                              <p className="text-green-600 dark:text-green-400 font-medium">
                                출근 {format(parseISO(r.checked_in_at), 'HH:mm', { locale: ko })}
                              </p>
                              {r.checked_out_at ? (
                                <p className="text-purple-600 dark:text-purple-400">
                                  퇴근 {format(parseISO(r.checked_out_at), 'HH:mm', { locale: ko })}
                                </p>
                              ) : (
                                <p className="text-amber-600 dark:text-amber-400">미퇴근</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">미출근</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 휴가 탭 ── */}
      {activeTab === '휴가' && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
          {!vacSummary ? (
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-4">불러오는 중...</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Sun className="h-4 w-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">
                  {vacSummary.year}년 휴가 현황
                </h2>
                <span className="ml-auto text-xs text-[#9CA3AF] dark:text-[#64748B]">평일 기준</span>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] p-2.5 text-center">
                  <p className="text-[10px] text-[#6B7280] dark:text-[#94A3B8] mb-0.5">총 휴가</p>
                  <p className="text-base font-bold text-[#111827] dark:text-[#F1F5F9]">{vacSummary.total_days}일</p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2.5 text-center">
                  <p className="text-[10px] text-orange-600 dark:text-orange-400 mb-0.5">사용</p>
                  <p className="text-base font-bold text-orange-600 dark:text-orange-400">{vacSummary.used_days}일</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2.5 text-center">
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-0.5">대기</p>
                  <p className="text-base font-bold text-amber-600 dark:text-amber-400">{vacSummary.pending_days ?? 0}일</p>
                </div>
                <div className={`rounded-lg p-2.5 text-center ${vacSummary.remaining_days <= 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                  <p className={`text-[10px] mb-0.5 ${vacSummary.remaining_days <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>잔여</p>
                  <p className={`text-base font-bold ${vacSummary.remaining_days <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {vacSummary.remaining_days}일
                  </p>
                </div>
              </div>

              {/* 결재 대기 중인 신청 (본인) */}
              {vacSummary.pending_requests && vacSummary.pending_requests.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      결재 대기 ({vacSummary.pending_requests.length}건)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {vacSummary.pending_requests.map(pr => (
                      <div key={pr.id} className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#374151] dark:text-[#D1D5DB] truncate">
                            <span className="font-medium">{pr.title}</span>
                            <span className="text-[#6B7280] dark:text-[#94A3B8]"> · {pr.is_all_day
                              ? format(parseISO(pr.start_at), 'M월 d일', { locale: ko })
                              : format(parseISO(pr.start_at), 'M월 d일 HH:mm', { locale: ko })}
                              {pr.is_all_day && pr.start_at.slice(0, 10) !== pr.end_at.slice(0, 10) &&
                                ` ~ ${format(parseISO(pr.end_at), 'M월 d일', { locale: ko })}`}
                            </span>
                          </p>
                          <p className="text-[10px] text-[#6B7280] dark:text-[#94A3B8] mt-0.5">
                            결재자: {pr.approver?.full_name ?? '관리자'} · {pr.days}일
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2]"
                          disabled={withdrawing === pr.id}
                          onClick={() => handleWithdrawRequest(pr.id)}
                        >
                          {withdrawing === pr.id ? '…' : '철회'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <div className="flex justify-between text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">
                  <span>사용률</span>
                  <span>{Math.round(vacPct)}%</span>
                </div>
                <div className="h-2 bg-[#E5E7EB] dark:bg-[#334155] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${vacPct >= 100 ? 'bg-red-500' : vacPct >= 70 ? 'bg-orange-400' : 'bg-green-500'}`}
                    style={{ width: `${vacPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarDays className="h-3.5 w-3.5 text-[#6B7280]" />
                  <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8]">사용 내역</p>
                </div>
                {vacSummary.history.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF] dark:text-[#64748B] text-center py-3">
                    사용한 휴가가 없습니다.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {vacSummary.history.map(h => (
                      <div key={h.id} className="flex items-center justify-between rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">☀️</span>
                          <span className="text-xs text-[#374151] dark:text-[#D1D5DB]">
                            {h.start_date === h.end_date
                              ? format(new Date(h.start_date), 'M월 d일 (EEE)', { locale: ko })
                              : `${format(new Date(h.start_date), 'M월 d일', { locale: ko })} ~ ${format(new Date(h.end_date), 'M월 d일', { locale: ko })}`
                            }
                          </span>
                        </div>
                        <span className="text-xs font-medium text-orange-600 dark:text-orange-400 shrink-0 ml-2">
                          {h.days}일
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      )}

      {/* ── 인사관리 탭 (조회만, 편집은 추후) ── */}
      {activeTab === '인사관리' && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
          <div className="flex items-center gap-2 mb-4">
            <IdCard className="h-4 w-4 text-[#2563EB]" />
            <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">인사 정보</h2>
            <span className="ml-auto text-[10px] text-[#9CA3AF] dark:text-[#64748B]">조회 전용</span>
          </div>

          <div className="space-y-3">
            <InfoRow label="이름" value={profile.full_name} />
            <InfoRow label="이메일" value={email || '—'} />
            <InfoRow
              label="직책"
              value={displayRoleLabel(profile as any)}
              accent={(profile as any).is_super_admin || profile.role === 'admin' ? 'blue' : profile.role === 'manager' ? 'green' : undefined}
            />
            <InfoRow label="소속 팀" value={profile.team ? (profile.team as any).name : '—'} />
            <InfoRow label="사번" value={hrRecord?.employee_no || '—'} muted={!hrRecord?.employee_no} />
            <InfoRow label="입사일" value={hrRecord?.hire_date || '—'} muted={!hrRecord?.hire_date} />
            <InfoRow label="생년월일" value={hrRecord?.birth_date || '—'} muted={!hrRecord?.birth_date} />
            <InfoRow label="연락처" value={hrRecord?.phone || '—'} muted={!hrRecord?.phone} />
            <InfoRow label="비상연락처" value={hrRecord?.emergency_contact || '—'} muted={!hrRecord?.emergency_contact} />
            <InfoRow label="주소" value={hrRecord?.address || '—'} muted={!hrRecord?.address} />
            {hrRecord?.notes && (
              <div className="text-sm border-b border-[#F3F4F6] dark:border-[#334155] pb-2 last:border-0 last:pb-0">
                <span className="text-[#6B7280] dark:text-[#94A3B8] block mb-1">메모</span>
                <span className="text-[#111827] dark:text-[#F1F5F9] whitespace-pre-wrap text-xs leading-relaxed">{hrRecord.notes}</span>
              </div>
            )}
          </div>

          {(() => {
            const eduList = (hrRecord?.education ?? []).filter(v => typeof v === 'string' && v.trim().length > 0)
            const carList = (hrRecord?.career ?? []).filter(v => typeof v === 'string' && v.trim().length > 0)
            const certList = (hrRecord?.certificates ?? []).filter(v => typeof v === 'string' && v.trim().length > 0)
            if (eduList.length === 0 && carList.length === 0 && certList.length === 0) return null
            const SectionList = ({ title, items }: { title: string, items: string[] }) => (
              items.length === 0 ? null : (
                <div>
                  <p className="text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] mb-1.5">{title}</p>
                  <ul className="space-y-1">
                    {items.map((v, i) => (
                      <li key={i} className="text-sm text-[#111827] dark:text-[#F1F5F9] leading-relaxed">• {v}</li>
                    ))}
                  </ul>
                </div>
              )
            )
            return (
              <div className="mt-5 space-y-4 rounded-lg border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0F172A] px-4 py-4">
                <SectionList title="학력" items={eduList} />
                <SectionList title="경력" items={carList} />
                <SectionList title="자격증" items={certList} />
              </div>
            )
          })()}

          <div className="mt-5 rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] border border-dashed border-[#E5E7EB] dark:border-[#334155] px-4 py-3">
            <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
              사번·입사일·학력·경력 등 인사기록은 앱관리자가 입력·수정·삭제합니다. 변경이 필요하면 앱관리자에게 요청하세요.
            </p>
          </div>
        </div>
      )}

      {/* ── 비밀번호 탭 ── */}
      {activeTab === '비밀번호' && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
            <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">비밀번호 변경</h2>
          </div>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            {([
              { key: 'current', label: '현재 비밀번호' },
              { key: 'next',    label: '새 비밀번호' },
              { key: 'confirm', label: '새 비밀번호 확인' },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1">{label}</label>
                <div className="relative">
                  <Input
                    type={showPw[key] ? 'text' : 'password'}
                    value={pwForm[key]}
                    onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={label}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
                    tabIndex={-1}
                  >
                    {showPw[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
            <Button type="submit" className="w-full mt-2" disabled={pwLoading}>
              {pwLoading ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </form>
        </div>
      )}

      {/* 휴가 결재 승인 완료 팝업은 결재함(/approvals) 로 이전됨 */}

      {ToastComponent}
    </div>
  )
}
