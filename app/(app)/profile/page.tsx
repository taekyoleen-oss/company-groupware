'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Eye, EyeOff, KeyRound, Sun, CalendarDays,
  MapPin, CheckCircle2, Navigation, Clock, Wifi, Settings, Lock,
  IdCard, Users, Save, CheckCircle, XCircle, ClipboardList, ChevronDown, ChevronUp,
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
}

type GpsStatus = 'idle' | 'checking' | 'near' | 'far' | 'error' | 'no_setting'
type IpStatus = 'idle' | 'checking' | 'allowed' | 'denied'

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle')
  const [ipStatus, setIpStatus] = useState<IpStatus>('idle')
  const [currentIp, setCurrentIp] = useState<string | null>(null)
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [todayAttendance, setTodayAttendance] = useState<{ checked_in_at: string; method?: string } | null>(null)
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const { showToast, ToastComponent } = useToast()

  const checkGps = (settings: CompanySettings) => {
    if (!settings.latitude || !settings.longitude) { setGpsStatus('no_setting'); return }
    if (!navigator.geolocation) { setGpsStatus('error'); return }
    setGpsStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, settings.latitude!, settings.longitude!)
        setDistanceMeters(Math.round(dist))
        setGpsStatus(dist <= settings.radius_meters ? 'near' : 'far')
      },
      () => setGpsStatus('error'),
      { timeout: 10000, maximumAge: 30000 }
    )
  }

  const checkIp = async () => {
    setIpStatus('checking')
    try {
      const res = await fetch('/api/attendance/ip-check')
      const data = await res.json()
      setCurrentIp(data.ip ?? null)
      setIpStatus(data.allowed ? 'allowed' : 'denied')
    } catch {
      setCurrentIp(null)
      setIpStatus('denied')
    }
  }

  const fetchApproverData = async () => {
    const [appRes, histRes] = await Promise.all([
      fetch('/api/vacation/approver'),
      fetch('/api/vacation-history'),
    ])
    if (appRes.ok) {
      const data: ApproverData = await appRes.json()
      setApproverData(data)
      const init: Record<string, number> = {}
      data.employees.forEach(e => { init[e.id] = e.total_days })
      setEmpTotalEdits(init)
    }
    if (histRes.ok) {
      const hist: VacHistoryItem[] = await histRes.json()
      setEmpHistory(hist)
    }
  }

  const fetchOwnVacation = async () => {
    const res = await fetch('/api/vacation')
    if (res.ok) setVacSummary(await res.json())
  }

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    })
    const todayStr = getLocalDateStr()
    Promise.all([
      fetch('/api/profiles').then(r => r.json()),
      fetch('/api/admin/teams').then(r => r.json()),
      fetch('/api/vacation').then(r => r.json()),
      fetch('/api/admin/settings').then(r => r.json()),
      fetch(`/api/attendance?date=${todayStr}`).then(r => r.json()),
    ]).then(([profileData, teamsData, vacData, settingsData, attendanceData]: [
      ProfileWithTeam, Team[], VacSummaryV2, CompanySettings, { checked_in_at: string; method?: string } | null
    ]) => {
      setProfile(profileData)
      setForm({ full_name: profileData.full_name, color: profileData.color, team_id: profileData.team_id ?? 'none' })
      setTeams(Array.isArray(teamsData) ? teamsData : [])
      if (vacData && typeof vacData.total_days === 'number') setVacSummary(vacData)
      setCompanySettings(settingsData)
      setTodayAttendance(attendanceData)
      if (settingsData) {
        if (settingsData.attendance_method === 'ip') {
          if (!attendanceData) checkIp()
        } else {
          if (!settingsData.latitude || !settingsData.longitude) setGpsStatus('no_setting')
          else if (!attendanceData) checkGps(settingsData)
        }
      }
    })
    fetchApproverData()
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
      setTodayAttendance({ checked_in_at: data.checked_in_at, method: data.method })
      showToast('출근이 확인되었습니다.', 'success')
    } else if (res.status === 409) {
      setTodayAttendance({ checked_in_at: data.checked_in_at, method: data.method })
      showToast('이미 출근 처리되었습니다.', 'success')
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

  const checkedInTime = todayAttendance?.checked_in_at
    ? format(new Date(todayAttendance.checked_in_at), 'HH:mm')
    : null

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
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
          {companySettings === null ? (
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-4">불러오는 중...</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                {companySettings.attendance_method === 'ip'
                  ? <Wifi className="h-4 w-4 text-blue-500" />
                  : <MapPin className="h-4 w-4 text-blue-500" />
                }
                <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">오늘 출근 확인</h2>
                <span className="ml-auto text-xs text-[#9CA3AF] dark:text-[#64748B]">
                  {getLocalDateStr().replace(/-/g, '.')}
                </span>
              </div>

              {checkedInTime ? (
                <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">출근 완료</p>
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {todayAttendance?.method === 'office_login'
                        ? `🖥️ 사무실 PC 로그인 출근 ${checkedInTime}`
                        : `📍 GPS 출근 ${checkedInTime}`
                      }
                    </p>
                  </div>
                </div>
              ) : companySettings.attendance_method === 'ip' ? (
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
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-none" onClick={checkIp} disabled={ipStatus === 'checking'}>
                      <Wifi className="h-3.5 w-3.5 mr-1" />재확인
                    </Button>
                    <Button type="button" className="flex-1" disabled={ipStatus !== 'allowed' || checkingIn} onClick={handleCheckIn}>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />{checkingIn ? '처리 중...' : '출근 확인'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {gpsStatus === 'no_setting' && (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
                      관리자가 회사 위치를 아직 설정하지 않았습니다.
                    </p>
                  )}
                  {gpsStatus === 'checking' && (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2 animate-pulse">위치 확인 중...</p>
                  )}
                  {gpsStatus === 'error' && (
                    <p className="text-sm text-red-500 dark:text-red-400 text-center py-2">
                      위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 허용해 주세요.
                    </p>
                  )}
                  {gpsStatus === 'idle' && (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
                      위치 확인 버튼을 눌러 출근 가능 여부를 확인하세요.
                    </p>
                  )}
                  {(gpsStatus === 'near' || gpsStatus === 'far') && distanceMeters !== null && (
                    <div className={cn(
                      'rounded-lg px-4 py-2.5 text-sm flex items-center gap-2',
                      gpsStatus === 'near'
                        ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
                        : 'bg-[#F9FAFB] dark:bg-[#0F172A] text-[#6B7280] dark:text-[#94A3B8]'
                    )}>
                      <Navigation className="h-4 w-4 shrink-0" />
                      <span>
                        회사까지 {distanceMeters.toLocaleString()}m
                        {gpsStatus === 'near'
                          ? ' — 출근 가능 범위입니다.'
                          : ` — 반경 ${companySettings.radius_meters}m 이내로 이동하세요.`}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-none"
                      onClick={() => companySettings && checkGps(companySettings)}
                      disabled={gpsStatus === 'checking'}>
                      <Navigation className="h-3.5 w-3.5 mr-1" />위치 재확인
                    </Button>
                    <Button type="button" className="flex-1" disabled={gpsStatus !== 'near' || checkingIn} onClick={handleCheckIn}>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />{checkingIn ? '처리 중...' : '출근 확인'}
                    </Button>
                  </div>
                </div>
              )}
            </>
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
            <InfoRow label="입사일" value="—" muted />
            <InfoRow label="사번" value="—" muted />
            <InfoRow label="생년월일" value="—" muted />
            <InfoRow label="연락처" value="—" muted />
            <InfoRow label="비상연락처" value="—" muted />
            <InfoRow label="주소" value="—" muted />
          </div>

          <div className="mt-5 rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] border border-dashed border-[#E5E7EB] dark:border-[#334155] px-4 py-3">
            <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
              인사 정보 입력·관리는 추후 제공될 예정입니다.
              현재는 시스템이 보유한 기본 정보만 표시합니다.
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
