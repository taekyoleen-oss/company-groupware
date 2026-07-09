'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Plus, Trash2, X, Save, Sun, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList, Settings, Clock, CheckCircle, XCircle, Wifi, Download, ShieldAlert, Monitor, RefreshCw, IdCard, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { ProfileWithTeam, Team, EventCategory } from '@/types/app'

// 드롭다운에서 다루는 역할 값
//  - 'member'      → 실무자
//  - 'manager'     → 관리자(결재자)
//  - 'super_admin' → 앱관리자 (DB 저장 시 role='admin' + is_super_admin=true)
type RoleSelectValue = 'member' | 'manager' | 'super_admin'

function toRoleSelectValue(p: { role?: string | null; is_super_admin?: boolean | null }): RoleSelectValue {
  if (p.is_super_admin) return 'super_admin'
  if (p.role === 'manager') return 'manager'
  // 레거시 role='admin' & super=false 인 경우는 super_admin 으로 표시 (저장 시 is_super_admin=true)
  if (p.role === 'admin') return 'super_admin'
  return 'member'
}

function roleValueToPayload(v: RoleSelectValue): { role: 'admin' | 'manager' | 'member'; is_super_admin: boolean } {
  if (v === 'super_admin') return { role: 'admin', is_super_admin: true }
  if (v === 'manager')     return { role: 'manager', is_super_admin: false }
  return { role: 'member', is_super_admin: false }
}

interface VacationUser {
  id: string
  full_name: string
  color: string
  team_id: string | null
  role: string
  is_super_admin?: boolean
  status: string
  approver_id: string | null
  approver_name: string | null
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
  requester: { id: string; full_name: string; color: string; approver_id: string | null }
  approver: { id: string; full_name: string; color: string } | null
  reviewer: { id: string; full_name: string; color: string } | null
}

interface CancelRequest {
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
  requester: { id: string; full_name: string; color: string; approver_id: string | null }
  reviewer: { id: string; full_name: string; color: string } | null
  event: { id: string; title: string; start_at: string; end_at: string; is_all_day: boolean } | null
}

interface HistoryItem {
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

// 신청 row → 표시용 휴가 정보 (라이브 이벤트가 있으면 우선, 없으면 스냅샷 fallback)
function eventInfo(req: CancelRequest) {
  const title    = req.event?.title      ?? req.event_title    ?? '(휴가)'
  const startAt  = req.event?.start_at   ?? req.event_start_at
  const endAt    = req.event?.end_at     ?? req.event_end_at
  const isAllDay = req.event?.is_all_day ?? req.event_is_all_day ?? true
  return { title, startAt, endAt, isAllDay }
}

interface AttendanceRecord {
  id: string
  full_name: string
  color: string
  team_id: string | null
  role: string
  checked_in_at: string | null
  checked_out_at: string | null
  method: string | null
}

interface AttendanceHistoryItem {
  id: string
  user_id: string
  date: string
  checked_in_at: string
  checked_out_at: string | null
  method: 'gps' | 'office_login'
  full_name: string
  color: string
  team_name: string | null
}

interface CompanySettings {
  address: string
  latitude: number | null
  longitude: number | null
  radius_meters: number
  attendance_method: 'gps' | 'ip'
  office_ips: string
  require_device_approval: boolean
}

interface OfficeDevice {
  id: string
  user_id: string
  user_agent: string
  last_ip: string | null
  device_label: string | null
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  decided_at: string | null
  last_used_at: string | null
  user: { id: string; full_name: string; color: string } | null
  decider: { id: string; full_name: string } | null
}

interface OfficeNetwork {
  id: string
  cidr: string
  label: string | null
  last_matched_at: string | null
  created_at: string
}

const STATUS_LABEL = { pending: '대기', active: '활성', inactive: '비활성' }

interface UserEdit {
  role: RoleSelectValue
  team_id: string
  status: string
  approver_id: string // 'self' = 본인 결재 (NULL 저장)
  dirty: boolean
}

type ConfirmAction =
  | { type: 'team'; id: string; name: string }
  | { type: 'category'; id: string; name: string }

function toLocalDateStr(d: Date = new Date()) {
  return d.toLocaleDateString('sv-SE') // YYYY-MM-DD
}

const VALID_TABS = new Set(['users', 'attendance', 'vacation', 'teams', 'categories', 'hr', 'settings'])

interface HrRecord {
  user_id: string
  hire_date: string | null
  hire_position: string | null
  resident_id: string | null
  phone: string | null
  emergency_contact: string | null
  address: string | null
  notes: string | null
  education: string[] | null
  career: string[] | null
  certificates: string[] | null
  updated_at?: string | null
}

type HrEditValues = Omit<HrRecord, 'user_id' | 'updated_at' | 'education' | 'career' | 'certificates'> & {
  education: string[]
  career: string[]
  certificates: string[]
}

const EDUCATION_ROWS = 3
const CAREER_ROWS = 5
const CERTIFICATE_ROWS = 5

const EMPTY_HR_EDIT: HrEditValues = {
  hire_date: '',
  hire_position: '',
  resident_id: '',
  phone: '',
  emergency_contact: '',
  address: '',
  notes: '',
  education: Array(EDUCATION_ROWS).fill(''),
  career: Array(CAREER_ROWS).fill(''),
  certificates: Array(CERTIFICATE_ROWS).fill(''),
}

function padList(list: string[] | null | undefined, size: number): string[] {
  const src = Array.isArray(list) ? list.slice(0, size) : []
  const out = src.map(v => (typeof v === 'string' ? v : ''))
  while (out.length < size) out.push('')
  return out
}

// useSearchParams 를 쓰는 컴포넌트는 Next.js 빌드 시 Suspense 경계가 필요해
// 실제 페이지 로직을 inner 로 분리하고 default export 는 Suspense 로 감싼다.
export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-[#6B7280]">불러오는 중...</div>}>
      <AdminPageInner />
    </Suspense>
  )
}

function AdminPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast, ToastComponent } = useToast()
  const [users, setUsers] = useState<ProfileWithTeam[]>([])
  const [edits, setEdits] = useState<Record<string, UserEdit>>({})
  const [teams, setTeams] = useState<Team[]>([])
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [teamAbbrEdits, setTeamAbbrEdits] = useState<Record<string, string>>({})
  const [newCat, setNewCat] = useState({ name: '', color: '#3B82F6' })
  const [saving, setSaving] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [vacationUsers, setVacationUsers] = useState<VacationUser[]>([])
  const [vacEdits, setVacEdits] = useState<Record<string, number>>({})
  const [vacApproverEdits, setVacApproverEdits] = useState<Record<string, string>>({})
  const [vacSaving, setVacSaving] = useState<string | null>(null)
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([])
  const [cancelProcessing, setCancelProcessing] = useState<string | null>(null)
  const [vacationRequests, setVacationRequests] = useState<VacationRequest[]>([])
  const [requestProcessing, setRequestProcessing] = useState<string | null>(null)
  const [approveComplete, setApproveComplete] = useState<{ kind: 'cancel' | 'request' } | null>(null)
  // 비밀번호 초기화 — 대상 회원의 비밀번호를 'password' 로 일괄 변경
  const [pwResetConfirm, setPwResetConfirm] = useState<{ id: string; name: string } | null>(null)
  const [pwResetting, setPwResetting] = useState<string | null>(null)
  // 탭 컨트롤 — 승인 완료 후 휴가 탭으로 자동 이동시키기 위해 controlled 로 운용
  // URL ?tab=... 파라미터가 유효하면 그 값을 초기 탭으로 사용
  const initialTab = (() => {
    const t = searchParams.get('tab')
    return t && VALID_TABS.has(t) ? t : 'users'
  })()
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  // URL ?tab=... 이 바뀌면 (다른 페이지에서 새 링크로 진입) 탭도 동기화
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && VALID_TABS.has(t)) setActiveTab(t)
  }, [searchParams])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])

  // 휴가 처리 이력 다운로드 — 승인/취소를 한 파일로 함께 받음
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadPeriod, setDownloadPeriod] = useState<'1m' | '3m' | 'custom'>('1m')
  // 본인 결재(자기결재 자동 승인) 포함 여부 — 기본 포함
  const [includeSelfApproved, setIncludeSelfApproved] = useState(true)
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return toLocalDateStr(d)
  })
  const [customTo, setCustomTo] = useState<string>(toLocalDateStr())

  // 출근 관리
  const [attendanceDate, setAttendanceDate] = useState<string>(toLocalDateStr())
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // 출근 이력
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryItem[]>([])
  const [attendanceHistoryOpen, setAttendanceHistoryOpen] = useState(false)
  const [attendanceDownloadOpen, setAttendanceDownloadOpen] = useState(false)
  const [attDownloadPeriod, setAttDownloadPeriod] = useState<'1m' | '3m' | 'custom'>('1m')
  const [attCustomFrom, setAttCustomFrom] = useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return toLocalDateStr(d)
  })
  const [attCustomTo, setAttCustomTo] = useState<string>(toLocalDateStr())

  // 회사 설정
  const [settings, setSettings] = useState<CompanySettings>({ address: '', latitude: null, longitude: null, radius_meters: 200, attendance_method: 'ip', office_ips: '', require_device_approval: false })
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // 사무실 네트워크(IP/CIDR) 목록
  const [networks, setNetworks] = useState<OfficeNetwork[]>([])
  const [networkLabelEdits, setNetworkLabelEdits] = useState<Record<string, string>>({})
  const [newNetworkCidr, setNewNetworkCidr] = useState('')
  const [newNetworkLabel, setNewNetworkLabel] = useState('')
  const [networkSaving, setNetworkSaving] = useState<string | null>(null)
  const [networkAdding, setNetworkAdding] = useState(false)

  // 등록된 PC(디바이스) 목록
  const [devices, setDevices] = useState<OfficeDevice[]>([])
  const [deviceProcessing, setDeviceProcessing] = useState<string | null>(null)
  const [deviceLabelEdits, setDeviceLabelEdits] = useState<Record<string, string>>({})

  // 인사관리 모달
  const [hrModalUser, setHrModalUser] = useState<ProfileWithTeam | null>(null)
  const [hrEdit, setHrEdit] = useState<HrEditValues>(EMPTY_HR_EDIT)
  const [hrLoading, setHrLoading] = useState(false)
  const [hrSaving, setHrSaving] = useState(false)
  const [hrHasRecord, setHrHasRecord] = useState(false)
  const [hrConfirmDelete, setHrConfirmDelete] = useState(false)

  const fetchAll = useCallback(async () => {
    const [usersRes, teamsRes, catsRes, vacRes, cancelRes, historyRes, vacReqRes, attHistRes] = await Promise.all([
      fetch('/api/admin/users'), fetch('/api/admin/teams'), fetch('/api/admin/categories'),
      fetch('/api/admin/vacation'), fetch('/api/vacation-cancel-requests'),
      fetch('/api/vacation-history'), fetch('/api/vacation/requests'),
      fetch('/api/admin/attendance/history'),
    ])
    if (vacReqRes.ok) setVacationRequests(await vacReqRes.json())
    if (attHistRes.ok) setAttendanceHistory(await attHistRes.json())
    if (usersRes.ok) {
      const data: ProfileWithTeam[] = await usersRes.json()
      setUsers(data)
      const initial: Record<string, UserEdit> = {}
      data.forEach(u => {
        initial[u.id] = {
          role: toRoleSelectValue(u as any),
          team_id: u.team_id ?? 'none',
          status: u.status,
          approver_id: u.approver_id ?? 'self',
          dirty: false,
        }
      })
      setEdits(initial)
    }
    if (teamsRes.ok) {
      const teamsData: Team[] = await teamsRes.json()
      setTeams(teamsData)
      const initAbbrs: Record<string, string> = {}
      teamsData.forEach(t => { initAbbrs[t.id] = t.abbreviation ?? t.name.slice(0, 2) })
      setTeamAbbrEdits(initAbbrs)
    }
    if (catsRes.ok) setCategories(await catsRes.json())
    if (vacRes.ok) {
      const vacData: VacationUser[] = await vacRes.json()
      setVacationUsers(vacData)
      const initVac: Record<string, number> = {}
      const initApprover: Record<string, string> = {}
      vacData.forEach(u => {
        initVac[u.id] = u.total_days
        initApprover[u.id] = u.approver_id ?? 'admin'
      })
      setVacEdits(initVac)
      setVacApproverEdits(initApprover)
    }
    if (cancelRes.ok) setCancelRequests(await cancelRes.json())
    if (historyRes.ok) setHistoryItems(await historyRes.json())
  }, [])

  const fetchAttendance = useCallback(async (date: string) => {
    setAttendanceLoading(true)
    const res = await fetch(`/api/admin/attendance?date=${date}`)
    if (res.ok) {
      const data = await res.json()
      setAttendanceRecords(data.records ?? [])
    }
    setAttendanceLoading(false)
  }, [])

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/admin/settings')
    if (res.ok) {
      const data = await res.json()
      setSettings({
        ...data,
        office_ips: data.office_ips ?? '',
        attendance_method: 'ip',
        require_device_approval: data.require_device_approval ?? false,
      })
    }
  }, [])

  const fetchDevices = useCallback(async () => {
    const res = await fetch('/api/admin/office-devices')
    if (res.ok) {
      const data: OfficeDevice[] = await res.json()
      setDevices(data)
      const labels: Record<string, string> = {}
      data.forEach(d => { labels[d.id] = d.device_label ?? '' })
      setDeviceLabelEdits(labels)
    }
  }, [])

  const fetchNetworks = useCallback(async () => {
    const res = await fetch('/api/admin/office-networks')
    if (res.ok) {
      const data: OfficeNetwork[] = await res.json()
      setNetworks(data)
      const labels: Record<string, string> = {}
      data.forEach(n => { labels[n.id] = n.label ?? '' })
      setNetworkLabelEdits(labels)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchAttendance(attendanceDate) }, [fetchAttendance, attendanceDate])
  useEffect(() => { fetchSettings() }, [fetchSettings])
  useEffect(() => { fetchNetworks() }, [fetchNetworks])
  useEffect(() => { fetchDevices() }, [fetchDevices])

  // 디바이스 승인/거절/삭제 핸들러
  const handleDeviceAction = async (id: string, action: 'approve' | 'reject') => {
    setDeviceProcessing(id)
    const res = await fetch(`/api/admin/office-devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setDeviceProcessing(null)
    if (res.ok) { showToast(action === 'approve' ? '승인되었습니다.' : '거절되었습니다.', 'success'); fetchDevices() }
    else { showToast('처리에 실패했습니다.', 'error') }
  }

  const handleDeviceLabelSave = async (id: string) => {
    const label = deviceLabelEdits[id] ?? ''
    setDeviceProcessing(id)
    const res = await fetch(`/api/admin/office-devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_label: label }),
    })
    setDeviceProcessing(null)
    if (res.ok) { showToast('라벨이 저장되었습니다.', 'success'); fetchDevices() }
    else { showToast('저장에 실패했습니다.', 'error') }
  }

  // ── 인사관리 모달 핸들러 ───────────────────────────
  const openHrModal = async (user: ProfileWithTeam) => {
    setHrModalUser(user)
    setHrEdit(EMPTY_HR_EDIT)
    setHrHasRecord(false)
    setHrLoading(true)
    setHrConfirmDelete(false)
    const res = await fetch(`/api/admin/hr-records/${user.id}`)
    setHrLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '불러오기에 실패했습니다.', 'error')
      return
    }
    const data: HrRecord | null = await res.json()
    if (data) {
      setHrHasRecord(true)
      setHrEdit({
        hire_date: data.hire_date ?? '',
        hire_position: data.hire_position ?? '',
        resident_id: data.resident_id ?? '',
        phone: data.phone ?? '',
        emergency_contact: data.emergency_contact ?? '',
        address: data.address ?? '',
        notes: data.notes ?? '',
        education: padList(data.education, EDUCATION_ROWS),
        career: padList(data.career, CAREER_ROWS),
        certificates: padList(data.certificates, CERTIFICATE_ROWS),
      })
    }
  }

  const closeHrModal = () => {
    if (hrSaving) return
    setHrModalUser(null)
    setHrEdit(EMPTY_HR_EDIT)
    setHrHasRecord(false)
    setHrConfirmDelete(false)
  }

  const saveHrRecord = async () => {
    if (!hrModalUser) return
    setHrSaving(true)
    const res = await fetch(`/api/admin/hr-records/${hrModalUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hrEdit),
    })
    setHrSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '저장에 실패했습니다.', 'error')
      return
    }
    showToast('인사기록이 저장되었습니다.', 'success')
    setHrHasRecord(true)
  }

  const deleteHrRecord = async () => {
    if (!hrModalUser) return
    setHrSaving(true)
    const res = await fetch(`/api/admin/hr-records/${hrModalUser.id}`, { method: 'DELETE' })
    setHrSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '삭제에 실패했습니다.', 'error')
      return
    }
    showToast('인사기록이 삭제되었습니다.', 'success')
    setHrEdit(EMPTY_HR_EDIT)
    setHrHasRecord(false)
    setHrConfirmDelete(false)
  }

  const handleDeviceDelete = async (id: string) => {
    if (!window.confirm('이 PC 등록을 삭제하시겠습니까?')) return
    setDeviceProcessing(id)
    const res = await fetch(`/api/admin/office-devices/${id}`, { method: 'DELETE' })
    setDeviceProcessing(null)
    if (res.ok) { showToast('삭제되었습니다.', 'success'); fetchDevices() }
    else { showToast('삭제에 실패했습니다.', 'error') }
  }

  // 휴가 취소 요청 / 신청 변경 / 사이드바에서 승인 → 자동 새로고침
  // 출근 기록 / PC 디바이스 신청·승인 → 실시간 반영
  useEffect(() => {
    const supabase = createClient()
    // 출근 기록은 아침 출퇴근 시간대에 초당 여러 건이 몰릴 수 있어, 변경마다 fetch 하지 않고
    // 짧게 debounce 하여 한 번만 갱신한다. 또한 출근 변경 시에는 attendance 만 갱신하고
    // 예전처럼 fetchAll()(API 8개)을 호출하지 않는다 — 출근 1건이 전체 재조회를 유발하던 문제 제거.
    let attTimer: ReturnType<typeof setTimeout> | null = null
    const refreshAttendanceSoon = () => {
      if (attTimer) clearTimeout(attTimer)
      attTimer = setTimeout(() => fetchAttendance(attendanceDate), 800)
    }
    const channel = supabase
      .channel('admin-page-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_cancel_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_attendance' }, refreshAttendanceSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_office_devices' }, () => fetchDevices())
      .subscribe()
    // 다른 컴포넌트(예: AdminSidebar)에서 휴가 취소를 승인하고 확인을 누른 경우에도
    // 관리자 패널의 활성 탭을 휴가 관리로 전환하고 목록을 갱신한다.
    const handler = () => { setActiveTab('vacation'); fetchAll() }
    window.addEventListener('vacation-cancel-approved', handler)
    return () => {
      if (attTimer) clearTimeout(attTimer)
      supabase.removeChannel(channel)
      window.removeEventListener('vacation-cancel-approved', handler)
    }
  }, [fetchAll, fetchAttendance, fetchDevices, attendanceDate])

  const shiftDate = (days: number) => {
    const d = new Date(attendanceDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setAttendanceDate(toLocalDateStr(d))
  }

  const setEdit = (id: string, field: Partial<UserEdit>) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...field, dirty: true } }))
  }

  const saveUser = async (id: string) => {
    const edit = edits[id]
    if (!edit) return
    setSaving(id)
    const { role, is_super_admin } = roleValueToPayload(edit.role)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        is_super_admin,
        team_id: edit.team_id === 'none' ? null : edit.team_id,
        status: edit.status,
        approver_id: edit.approver_id === 'self' ? null : edit.approver_id,
      }),
    })
    setSaving(null)
    if (res.ok) { showToast('저장되었습니다.', 'success'); fetchAll() }
    else {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '저장에 실패했습니다.', 'error')
    }
  }

  const approveUser = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    if (res.ok) { showToast('승인되었습니다.', 'success'); fetchAll() }
  }

  const resetPassword = async (id: string) => {
    setPwResetting(id)
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    setPwResetting(null)
    setPwResetConfirm(null)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const name = data.user?.full_name ?? ''
      showToast(`${name ? name + '님의 ' : ''}비밀번호가 'password' 로 초기화되었습니다.`, 'success')
    } else {
      showToast((data as any).error ?? '비밀번호 초기화에 실패했습니다.', 'error')
    }
  }

  const addTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTeamName) return
    const res = await fetch('/api/admin/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTeamName }),
    })
    if (res.ok) { setNewTeamName(''); showToast('팀이 생성되었습니다.', 'success'); fetchAll() }
  }

  const saveTeamAbbr = async (teamId: string) => {
    const abbr = teamAbbrEdits[teamId]?.trim()
    const res = await fetch(`/api/admin/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abbreviation: abbr || null }),
    })
    if (res.ok) { showToast('약어가 저장되었습니다.', 'success'); fetchAll() }
    else showToast('저장에 실패했습니다.', 'error')
  }

  const handleConfirm = async () => {
    if (!confirmAction) return
    setConfirming(true)
    if (confirmAction.type === 'team') {
      await fetch(`/api/admin/teams/${confirmAction.id}`, { method: 'DELETE' })
    } else {
      await fetch(`/api/admin/categories/${confirmAction.id}`, { method: 'DELETE' })
    }
    setConfirming(false)
    setConfirmAction(null)
    fetchAll()
  }

  const handleVacationRequestAction = async (id: string, action: 'approve' | 'reject') => {
    setRequestProcessing(id)
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
    setRequestProcessing(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast((data as any).error ?? '처리에 실패했습니다.', 'error')
      return
    }
    if (action === 'approve') {
      // 승인 완료 팝업 → 확인 시 fetchAll로 목록 갱신
      setApproveComplete({ kind: 'request' })
    } else {
      showToast('휴가 신청이 거부되었습니다.', 'success')
      fetchAll()
    }
  }

  const handleVacationCancelRequest = async (id: string, action: 'approve' | 'reject') => {
    setCancelProcessing(id)
    const res = await fetch(`/api/vacation-cancel-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    setCancelProcessing(null)

    const raw = await res.text()
    let parsed: any = {}
    try { parsed = raw ? JSON.parse(raw) : {} } catch { /* non-JSON */ }

    if (!res.ok) {
      const msg = parsed.error
        ?? (raw ? `처리 실패 (${res.status}): ${raw.slice(0, 200)}` : `처리 실패 (${res.status})`)
      showToast(msg, 'error')
      return
    }

    if (action === 'approve') {
      // 승인 완료 팝업 → 확인 시 fetchAll로 목록 갱신
      setApproveComplete({ kind: 'cancel' })
    } else {
      setHistoryOpen(true)
      showToast('취소 신청이 거부되었습니다. 처리 이력에서 확인하실 수 있습니다.', 'success')
      fetchAll()
    }
  }

  const saveVacation = async (userId: string) => {
    const target = vacationUsers.find(u => u.id === userId)
    if (!target) return
    const totalEdit = vacEdits[userId]
    const approverEdit = vacApproverEdits[userId] ?? 'admin'

    const currentApproverKey = target.approver_id ?? 'admin'
    const approverChanged = approverEdit !== currentApproverKey
    const totalChanged = totalEdit !== undefined && totalEdit !== target.total_days

    if (!approverChanged && !totalChanged) return

    const payload: Record<string, unknown> = {}
    if (approverChanged) payload.approver_id = approverEdit === 'admin' ? null : approverEdit
    // total_days는 결재자가 본인(또는 관리자=null)인 경우에만 전송
    const newApproverIsSelfAdmin =
      (approverEdit === 'admin') // admin = null → 관리자 본인이 결재
    if (totalChanged && newApproverIsSelfAdmin) payload.total_days = totalEdit

    setVacSaving(userId)
    const res = await fetch(`/api/admin/vacation/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setVacSaving(null)
    if (res.ok) {
      showToast('저장되었습니다.', 'success'); fetchAll()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '저장에 실패했습니다.', 'error')
    }
  }

  const downloadHistoryCSV = () => {
    let fromTime: number
    let toTime: number
    let periodLabel: string

    if (downloadPeriod === '1m') {
      const from = new Date(); from.setMonth(from.getMonth() - 1); from.setHours(0, 0, 0, 0)
      const to = new Date(); to.setHours(23, 59, 59, 999)
      fromTime = from.getTime(); toTime = to.getTime()
      periodLabel = '직전1개월'
    } else if (downloadPeriod === '3m') {
      const from = new Date(); from.setMonth(from.getMonth() - 3); from.setHours(0, 0, 0, 0)
      const to = new Date(); to.setHours(23, 59, 59, 999)
      fromTime = from.getTime(); toTime = to.getTime()
      periodLabel = '직전3개월'
    } else {
      if (!customFrom || !customTo) { showToast('시작일과 종료일을 입력해주세요.', 'error'); return }
      if (customFrom > customTo) { showToast('시작일이 종료일보다 늦습니다.', 'error'); return }
      fromTime = new Date(customFrom + 'T00:00:00').getTime()
      toTime = new Date(customTo + 'T23:59:59.999').getTime()
      periodLabel = `${customFrom}_${customTo}`
    }

    const KIND_LABEL: Record<HistoryItem['kind'], string> = {
      grant: '휴가 승인',
      cancel_approved: '취소 승인',
      cancel_rejected: '취소 거부',
      request_rejected: '신청 거부',
    }

    // 승인/취소 4종을 모두 포함해 한 파일로 다운로드.
    // 시간 컬럼은 "승인 시간" / "취소 시간" 두 컬럼으로 나누어,
    // 같은 휴가가 승인됐다가 취소된 경우 두 시점이 명확히 구분되게 한다.
    // 본인 결재 자동 승인분(reviewer 가 없는 grant) 은 체크박스로 포함 여부 제어.
    const filtered = historyItems.filter(item => {
      if (!item.happened_at) return false
      const t = new Date(item.happened_at).getTime()
      if (t < fromTime || t > toTime) return false
      if (!includeSelfApproved && item.kind === 'grant' && !item.reviewer) return false
      return true
    })

    if (filtered.length === 0) {
      showToast('선택한 기간의 이력이 없습니다.', 'error')
      return
    }

    const fmtDt = (iso: string | null, allDay: boolean) => {
      if (!iso) return ''
      try { return format(parseISO(iso), allDay ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm') }
      catch { return '' }
    }

    // 같은 행에 승인 시간과 취소 시간을 각각 별도 컬럼으로 표시.
    // grant/request_rejected → '승인 시간' 컬럼만 채움.
    // cancel_approved/cancel_rejected → '취소 시간' 컬럼만 채움.
    const headers = ['구분', '신청자', '휴가명', '시작', '종료', '종일/반차', '승인 시간', '취소 시간', '결재자', '사유']
    const rows = filtered.map(item => {
      const happenedFmt = item.happened_at ? format(parseISO(item.happened_at), 'yyyy-MM-dd HH:mm') : ''
      const isCancelKind = item.kind === 'cancel_approved' || item.kind === 'cancel_rejected'
      return [
        KIND_LABEL[item.kind] ?? item.kind,
        item.requester?.full_name ?? '',
        item.event_title ?? '',
        fmtDt(item.event_start_at, item.event_is_all_day),
        fmtDt(item.event_end_at, item.event_is_all_day),
        item.event_is_all_day ? '종일' : '반차',
        isCancelKind ? '' : happenedFmt,
        isCancelKind ? happenedFmt : '',
        item.reviewer?.full_name ?? '',
        item.reason ?? '',
      ]
    })

    const escapeCsv = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n')

    // Excel에서 한글 깨짐 방지: UTF-8 BOM 추가
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `휴가처리이력_${periodLabel}_${toLocalDateStr()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setDownloadOpen(false)
    showToast(`${filtered.length}건을 다운로드했습니다.`, 'success')
  }

  const downloadAttendanceCSV = () => {
    let fromTime: number
    let toTime: number
    let periodLabel: string

    if (attDownloadPeriod === '1m') {
      const from = new Date(); from.setMonth(from.getMonth() - 1); from.setHours(0, 0, 0, 0)
      const to = new Date(); to.setHours(23, 59, 59, 999)
      fromTime = from.getTime(); toTime = to.getTime()
      periodLabel = '직전1개월'
    } else if (attDownloadPeriod === '3m') {
      const from = new Date(); from.setMonth(from.getMonth() - 3); from.setHours(0, 0, 0, 0)
      const to = new Date(); to.setHours(23, 59, 59, 999)
      fromTime = from.getTime(); toTime = to.getTime()
      periodLabel = '직전3개월'
    } else {
      if (!attCustomFrom || !attCustomTo) { showToast('시작일과 종료일을 입력해주세요.', 'error'); return }
      if (attCustomFrom > attCustomTo) { showToast('시작일이 종료일보다 늦습니다.', 'error'); return }
      fromTime = new Date(attCustomFrom + 'T00:00:00').getTime()
      toTime = new Date(attCustomTo + 'T23:59:59.999').getTime()
      periodLabel = `${attCustomFrom}_${attCustomTo}`
    }

    const filtered = attendanceHistory.filter(item => {
      const t = new Date(item.checked_in_at).getTime()
      return t >= fromTime && t <= toTime
    })

    if (filtered.length === 0) {
      showToast('선택한 기간의 이력이 없습니다.', 'error')
      return
    }

    const METHOD_LABEL: Record<AttendanceHistoryItem['method'], string> = {
      gps: 'GPS',
      office_login: '사무실 PC',
    }

    const headers = ['일자', '이름', '팀', '출근 시각', '퇴근 시각', '방식']
    const rows = filtered.map(item => [
      item.date,
      item.full_name,
      item.team_name ?? '',
      format(parseISO(item.checked_in_at), 'yyyy-MM-dd HH:mm'),
      item.checked_out_at ? format(parseISO(item.checked_out_at), 'yyyy-MM-dd HH:mm') : '',
      METHOD_LABEL[item.method] ?? item.method,
    ])

    const escapeCsv = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `출근이력_${periodLabel}_${toLocalDateStr()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setAttendanceDownloadOpen(false)
    showToast(`${filtered.length}건을 다운로드했습니다.`, 'success')
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCat.name) return
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCat),
    })
    if (res.ok) { setNewCat({ name: '', color: '#3B82F6' }); showToast('카테고리가 추가되었습니다.', 'success'); fetchAll() }
  }

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsSaving(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSettingsSaving(false)
    if (res.ok) { showToast('설정이 저장되었습니다.', 'success'); setSettingsDirty(false) }
    else showToast('저장에 실패했습니다.', 'error')
  }

  const addNetwork = async (cidr: string, label: string | null) => {
    setNetworkAdding(true)
    const res = await fetch('/api/admin/office-networks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cidr, label }),
    })
    setNetworkAdding(false)
    if (res.ok) {
      showToast('등록되었습니다.', 'success')
      fetchNetworks()
      return true
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? '등록에 실패했습니다.', 'error')
      return false
    }
  }

  const addCurrentIpAsNetwork = async () => {
    const res = await fetch('/api/admin/my-ip')
    if (!res.ok) { showToast('현재 IP를 가져올 수 없습니다.', 'error'); return }
    const { ip } = await res.json()
    if (!ip) { showToast('IP를 확인할 수 없습니다.', 'error'); return }
    const cidr = `${ip}/32`
    if (networks.some(n => n.cidr === cidr)) {
      showToast('이미 등록된 IP입니다.', 'error')
      return
    }
    await addNetwork(cidr, '본사')
  }

  const addNetworkManual = async (e: React.FormEvent) => {
    e.preventDefault()
    const cidr = newNetworkCidr.trim()
    if (!cidr) return
    const ok = await addNetwork(cidr, newNetworkLabel.trim() || null)
    if (ok) { setNewNetworkCidr(''); setNewNetworkLabel('') }
  }

  const saveNetworkLabel = async (id: string) => {
    const label = networkLabelEdits[id] ?? ''
    setNetworkSaving(id)
    const res = await fetch(`/api/admin/office-networks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    setNetworkSaving(null)
    if (res.ok) { showToast('라벨이 저장되었습니다.', 'success'); fetchNetworks() }
    else { showToast('저장에 실패했습니다.', 'error') }
  }

  const deleteNetwork = async (id: string) => {
    const res = await fetch(`/api/admin/office-networks/${id}`, { method: 'DELETE' })
    if (res.ok) { showToast('삭제되었습니다.', 'success'); fetchNetworks() }
    else { showToast('삭제에 실패했습니다.', 'error') }
  }

  // ── 팀 정렬 기반 사용자 정렬 헬퍼 ─────────────────────────
  // 팀 sort_order 순으로 그룹화 → 같은 팀 안에서는 가나다순 (full_name)
  // 팀 미지정(team_id=null) 인 사람은 마지막 그룹에 배치
  const teamOrderMap = (() => {
    const m = new Map<string, number>()
    teams.forEach((t, i) => m.set(t.id, t.sort_order ?? (i + 1) * 10))
    return m
  })()
  const NO_TEAM_ORDER = Number.MAX_SAFE_INTEGER
  function sortByTeamThenName<T extends { team_id?: string | null; full_name?: string | null; name?: string | null }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => {
      const ao = a.team_id ? (teamOrderMap.get(a.team_id) ?? NO_TEAM_ORDER) : NO_TEAM_ORDER
      const bo = b.team_id ? (teamOrderMap.get(b.team_id) ?? NO_TEAM_ORDER) : NO_TEAM_ORDER
      if (ao !== bo) return ao - bo
      const an = (a.full_name ?? a.name ?? '')
      const bn = (b.full_name ?? b.name ?? '')
      return an.localeCompare(bn, 'ko')
    })
  }

  // ── 팀 순서 변경 ──────────────────────────────────────────
  const reorderTeams = async (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= teams.length || fromIdx === toIdx) return
    const next = [...teams]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    // optimistic update
    setTeams(next)
    const res = await fetch('/api/admin/teams/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(t => t.id) }),
    })
    if (res.ok) showToast('팀 순서가 변경되었습니다.', 'success')
    else { showToast('팀 순서 변경에 실패했습니다.', 'error'); fetchAll() }
  }

  const pending = users.filter(u => u.status === 'pending')
  const active = users.filter(u => u.status !== 'pending')
  // 회원 관리: 팀 → 가나다 정렬
  const sortedActive = sortByTeamThenName(active)
  // 출근 관리: 팀 → 가나다 정렬
  const sortedAttendanceRecords = sortByTeamThenName(attendanceRecords)
  // 휴가 관리: 팀 → 가나다 정렬
  const sortedVacationUsers = sortByTeamThenName(vacationUsers)
  const pendingCancelRequests = cancelRequests.filter(r => r.status === 'pending')
  const pendingVacationRequests = vacationRequests.filter(r => r.status === 'pending')
  // 관리자가 직접 결재할 수 있는 대기 건 (대상의 approver_id가 null)
  const myActionableCancelRequests = pendingCancelRequests.filter(r =>
    (r.requester?.approver_id ?? null) === null
  )
  const myActionableVacationRequests = pendingVacationRequests.filter(r =>
    (r.approver_id ?? null) === null
  )
  const totalPending =
    pending.length + myActionableCancelRequests.length + myActionableVacationRequests.length

  const attendedCount = attendanceRecords.filter(r => r.checked_in_at).length
  const isToday = attendanceDate === toLocalDateStr()

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9]">관리자 패널</h1>
        <Button variant="outline" onClick={() => router.push('/calendar')}>
          <X className="h-4 w-4 mr-1" />닫기
        </Button>
      </div>

      {totalPending > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white text-sm font-bold shrink-0">{totalPending}</span>
          <div className="text-sm text-red-700 dark:text-red-300 flex flex-wrap gap-x-4 gap-y-0.5">
            {pending.length > 0 && <span>회원 승인 대기 <strong>{pending.length}명</strong></span>}
            {myActionableVacationRequests.length > 0 && <span>휴가 신청 승인 대기 <strong>{myActionableVacationRequests.length}건</strong></span>}
            {myActionableCancelRequests.length > 0 && <span>휴가 취소 승인 대기 <strong>{myActionableCancelRequests.length}건</strong></span>}
          </div>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v)
          // 탭 진입 시 최신 데이터 강제 새로고침 (실시간 구독이 잠시 끊겼을 때를 대비)
          if (v === 'attendance') fetchAttendance(attendanceDate)
          if (v === 'settings') { fetchDevices(); fetchNetworks() }
          if (v === 'users' || v === 'vacation') fetchAll()
        }}
      >
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="users">
            회원 관리 {pending.length > 0 && <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />출근 관리
          </TabsTrigger>
          <TabsTrigger value="vacation">
            휴가 관리
            {(myActionableVacationRequests.length + myActionableCancelRequests.length) > 0 && (
              <span className="ml-1 text-xs bg-orange-500 text-white rounded-full px-1.5">
                {myActionableVacationRequests.length + myActionableCancelRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="teams">팀 관리</TabsTrigger>
          <TabsTrigger value="categories">카테고리</TabsTrigger>
          <TabsTrigger value="hr">
            <IdCard className="h-3.5 w-3.5 mr-1" />인사관리
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-3.5 w-3.5 mr-1" />설정
          </TabsTrigger>
        </TabsList>

        {/* ── 회원 관리 ─────────────────────────────────────── */}
        <TabsContent value="users">
          {pending.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-[#F59E0B] mb-2">승인 대기 ({pending.length}명)</h2>
              <div className="space-y-2">
                {pending.map(user => (
                  <div key={user.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex items-center gap-3">
                    <UserAvatar name={user.full_name} color={user.color} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm dark:text-[#F1F5F9]">{user.full_name}</p>
                      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{user.email ?? '이메일 없음'}</p>
                    </div>
                    <Button size="sm" onClick={() => approveUser(user.id)}>
                      <Check className="h-4 w-4 mr-1" />승인
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <h2 className="text-sm font-semibold text-[#6B7280] dark:text-[#94A3B8] mb-2">전체 회원</h2>
          <div className="space-y-2">
            {sortedActive.map(user => {
              const edit = edits[user.id]
              if (!edit) return null
              // 결재자 후보: 활성 관리자(manager) 또는 앱관리자, 본인 제외
              const adminCandidates = active.filter(u => {
                if (u.id === user.id) return false
                const r = edits[u.id]?.role ?? toRoleSelectValue(u as any)
                return r === 'manager' || r === 'super_admin'
              })
              return (
                <div key={user.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <UserAvatar name={user.full_name} color={user.color} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm dark:text-[#F1F5F9]">{user.full_name}</p>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">{user.email ?? '이메일 없음'}</p>
                      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{(user.team as any)?.name ?? '팀 없음'}</p>
                    </div>
                  </div>
                  <Badge variant={edit.status === 'active' ? 'success' : 'danger'} className="text-[10px] px-1.5 py-0">{STATUS_LABEL[edit.status as keyof typeof STATUS_LABEL]}</Badge>
                  <Select value={edit.role} onValueChange={v => setEdit(user.id, { role: v as RoleSelectValue })}>
                    <SelectTrigger className="w-[72px] h-7 text-[11px] px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">실무자</SelectItem>
                      <SelectItem value="manager">관리자</SelectItem>
                      <SelectItem value="super_admin">앱관리자</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={edit.team_id} onValueChange={v => setEdit(user.id, { team_id: v })}>
                    <SelectTrigger className="w-[72px] h-7 text-[11px] px-2"><SelectValue placeholder="팀" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">팀 없음</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#6B7280] dark:text-[#94A3B8]">결재</span>
                    <Select value={edit.approver_id} onValueChange={v => setEdit(user.id, { approver_id: v })}>
                      <SelectTrigger className="h-7 text-[11px] px-2 w-[92px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">본인 결재</SelectItem>
                        {adminCandidates.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    variant={edit.status === 'active' ? 'secondary' : 'default'}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setEdit(user.id, { status: edit.status === 'active' ? 'inactive' : 'active' })}
                  >
                    {edit.status === 'active' ? '비활성' : '활성'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    title={pwResetting === user.id ? '발급 중...' : '비밀번호 초기화'}
                    disabled={pwResetting === user.id}
                    onClick={() => setPwResetConfirm({ id: user.id, name: user.full_name })}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 w-7 p-0"
                    title={saving === user.id ? '저장 중...' : '저장'}
                    disabled={!edit.dirty || saving === user.id}
                    onClick={() => saveUser(user.id)}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        </TabsContent>

        {/* ── 출근 관리 ─────────────────────────────────────── */}
        <TabsContent value="attendance">
          {/* 날짜 네비게이터 */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => shiftDate(-1)}
              className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-[#374151] transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-[#6B7280]" />
            </button>
            <Input
              type="date"
              value={attendanceDate}
              onChange={e => setAttendanceDate(e.target.value)}
              className="w-40 text-sm text-center"
            />
            <button
              onClick={() => shiftDate(1)}
              disabled={isToday}
              className="p-1.5 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-[#374151] transition-colors disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4 text-[#6B7280]" />
            </button>
            {!isToday && (
              <Button size="sm" variant="outline" onClick={() => setAttendanceDate(toLocalDateStr())}>
                오늘
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => fetchAttendance(attendanceDate)} disabled={attendanceLoading} title="새로고침">
              <RefreshCw className={`h-3.5 w-3.5 ${attendanceLoading ? 'animate-spin' : ''}`} />
            </Button>
            <span className="ml-auto text-sm text-[#6B7280] dark:text-[#94A3B8]">
              출근 <span className="font-semibold text-green-600">{attendedCount}</span>명
              {' / '}전체 <span className="font-semibold">{attendanceRecords.length}</span>명
            </span>
          </div>

          {attendanceLoading ? (
            <p className="text-sm text-[#6B7280] text-center py-8">불러오는 중...</p>
          ) : (
            <div className="space-y-2">
              {sortedAttendanceRecords.map(r => (
                <div key={r.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-4 py-3 flex items-center gap-3">
                  <UserAvatar name={r.full_name} color={r.color} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm dark:text-[#F1F5F9]">{r.full_name}</p>
                  </div>
                  {r.checked_in_at ? (
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        출근
                      </span>
                      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                        {format(parseISO(r.checked_in_at), 'HH:mm', { locale: ko })}
                      </span>
                      {r.checked_out_at ? (
                        <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 rounded px-1.5 py-0.5">
                          🏠 퇴근 {format(parseISO(r.checked_out_at), 'HH:mm', { locale: ko })}
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded px-1.5 py-0.5">
                          미퇴근
                        </span>
                      )}
                      {r.method === 'office_login' ? (
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded px-1.5 py-0.5">🖥️ 사무실</span>
                      ) : (
                        <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 rounded px-1.5 py-0.5">📍 GPS</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#D1D5DB] dark:bg-[#4B5563] shrink-0" />
                      <span className="text-sm text-[#9CA3AF] dark:text-[#6B7280]">미출근</span>
                    </div>
                  )}
                </div>
              ))}
              {attendanceRecords.length === 0 && (
                <p className="text-sm text-[#6B7280] text-center py-8">활성 회원이 없습니다.</p>
              )}
            </div>
          )}

          {/* ── 출근 이력 ─────────────────────────────────────── */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setAttendanceHistoryOpen(o => !o)}
                className="flex-1 flex items-center justify-between text-sm font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#D1D5DB] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4" />
                  출근 이력
                  <span className="text-xs bg-[#E5E7EB] dark:bg-[#374151] text-[#374151] dark:text-[#D1D5DB] rounded-full px-1.5">
                    {attendanceHistory.length}건
                  </span>
                </span>
                {attendanceHistoryOpen
                  ? <ChevronUp className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="ml-2 h-7 px-2 text-xs"
                onClick={() => setAttendanceDownloadOpen(true)}
                disabled={attendanceHistory.length === 0}
                title="출근 이력을 CSV로 다운로드"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                다운로드
              </Button>
            </div>
            {attendanceHistoryOpen && (
              attendanceHistory.length === 0 ? (
                <div className="text-xs text-[#9CA3AF] dark:text-[#6B7280] bg-[#F9FAFB] dark:bg-[#1E293B]/40 border border-dashed border-[#E5E7EB] dark:border-[#334155] rounded-lg px-4 py-6 text-center">
                  출근 이력이 없습니다.
                </div>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {attendanceHistory.map(item => (
                    <div key={item.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-3 py-2 flex items-center gap-3">
                      <UserAvatar name={item.full_name} color={item.color} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium dark:text-[#F1F5F9]">{item.full_name}</p>
                        <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                          {item.team_name ?? '팀 없음'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-[#374151] dark:text-[#D1D5DB]">
                          {format(parseISO(item.date), 'yyyy-MM-dd')}
                        </p>
                        <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8]">
                          출근 {format(parseISO(item.checked_in_at), 'HH:mm', { locale: ko })}
                          {item.checked_out_at && (
                            <> · 퇴근 {format(parseISO(item.checked_out_at), 'HH:mm', { locale: ko })}</>
                          )}
                        </p>
                      </div>
                      {item.method === 'office_login' ? (
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded px-1.5 py-0.5 shrink-0">🖥️ 사무실</span>
                      ) : (
                        <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 rounded px-1.5 py-0.5 shrink-0">📍 GPS</span>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </TabsContent>

        {/* ── 휴가 관리 ─────────────────────────────────────── */}
        <TabsContent value="vacation">
          {/* 휴가 신청 대기 — 전체 노출, 타인 결재 건은 읽기전용 */}
          {pendingVacationRequests.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                휴가 신청 요청
                <span className="text-xs bg-blue-500 text-white rounded-full px-1.5">{pendingVacationRequests.length}건 대기</span>
              </h2>
              <div className="space-y-2">
                {pendingVacationRequests.map(req => {
                  const isProcessing = requestProcessing === req.id
                  const canApprove = (req.approver_id ?? null) === null
                  const startDate = req.is_all_day
                    ? format(parseISO(req.start_at), 'M월 d일', { locale: ko })
                    : format(parseISO(req.start_at), 'M월 d일 HH:mm', { locale: ko })
                  const endDate = req.is_all_day
                    ? format(parseISO(req.end_at), 'M월 d일', { locale: ko })
                    : format(parseISO(req.end_at), 'HH:mm')
                  const otherApprover = req.approver?.full_name ?? null
                  return (
                    <div key={req.id} className={`bg-white dark:bg-[#1E293B] rounded-lg p-3 border ${
                      canApprove ? 'border-blue-200 dark:border-blue-800' : 'border-[#E5E7EB] dark:border-[#334155]'
                    }`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <UserAvatar name={req.requester?.full_name ?? ''} color={req.requester?.color ?? '#6B7280'} size={32} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm dark:text-[#F1F5F9]">{req.requester?.full_name}</p>
                          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                            {req.title} · {startDate}
                            {startDate !== endDate && ` ~ ${endDate}`}
                            {!req.is_all_day && <span className="ml-1 text-orange-500">반차</span>}
                          </p>
                          {req.description && (
                            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5 italic">"{req.description}"</p>
                          )}
                          {!canApprove && otherApprover && (
                            <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">
                              결재자: <span className="font-medium text-[#6B7280] dark:text-[#94A3B8]">{otherApprover}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canApprove ? (
                            <>
                              <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white h-8" disabled={isProcessing} onClick={() => handleVacationRequestAction(req.id, 'approve')}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />승인
                              </Button>
                              <Button size="sm" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2] h-8" disabled={isProcessing} onClick={() => handleVacationRequestAction(req.id, 'reject')}>
                                <XCircle className="h-3.5 w-3.5 mr-1" />거부
                              </Button>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#9CA3AF] bg-[#F3F4F6] dark:bg-[#374151] dark:text-[#94A3B8] rounded-full px-2 py-1">
                              조회 전용
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 휴가 취소 요청 (대기) — 전체 노출, 타인 결재 건은 읽기전용 */}
          {pendingCancelRequests.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                휴가 취소 요청
                <span className="text-xs bg-orange-500 text-white rounded-full px-1.5">{pendingCancelRequests.length}건 대기</span>
              </h2>
              <div className="space-y-2">
                {pendingCancelRequests.map(req => {
                  const isProcessing = cancelProcessing === req.id
                  const info = eventInfo(req)
                  const approverId = req.requester?.approver_id ?? null
                  // 관리자가 결재 가능 = approver_id가 null (관리자 본인이 결재)
                  const canApprove = approverId === null
                  // 결재자 이름 (타인일 때 표시용)
                  const otherApprover = approverId
                    ? (vacationUsers.find(u => u.id === approverId)?.full_name ?? '다른 결재자')
                    : null
                  const startDate = info.startAt
                    ? (info.isAllDay
                        ? format(parseISO(info.startAt), 'M월 d일', { locale: ko })
                        : format(parseISO(info.startAt), 'M월 d일 HH:mm', { locale: ko }))
                    : '(일정 정보 없음)'
                  const endDate = info.endAt
                    ? (info.isAllDay
                        ? format(parseISO(info.endAt), 'M월 d일', { locale: ko })
                        : format(parseISO(info.endAt), 'HH:mm'))
                    : ''
                  return (
                    <div key={req.id} className={`bg-white dark:bg-[#1E293B] rounded-lg p-3 border ${
                      canApprove ? 'border-orange-200 dark:border-orange-800' : 'border-[#E5E7EB] dark:border-[#334155]'
                    }`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <UserAvatar name={req.requester?.full_name ?? ''} color={req.requester?.color ?? '#6B7280'} size={32} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm dark:text-[#F1F5F9]">{req.requester?.full_name}</p>
                          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                            {info.title} · {startDate}
                            {endDate && startDate !== endDate && ` ~ ${endDate}`}
                            {!info.isAllDay && <span className="ml-1 text-orange-500">반차</span>}
                          </p>
                          {req.reason && (
                            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5 italic">"{req.reason}"</p>
                          )}
                          {!canApprove && (
                            <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">
                              결재자: <span className="font-medium text-[#6B7280] dark:text-[#94A3B8]">{otherApprover}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {canApprove ? (
                            <>
                              <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white h-8" disabled={isProcessing} onClick={() => handleVacationCancelRequest(req.id, 'approve')}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />승인
                              </Button>
                              <Button size="sm" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2] h-8" disabled={isProcessing} onClick={() => handleVacationCancelRequest(req.id, 'reject')}>
                                <XCircle className="h-3.5 w-3.5 mr-1" />거부
                              </Button>
                            </>
                          ) : (
                            <span className="text-[11px] text-[#9CA3AF] bg-[#F3F4F6] dark:bg-[#374151] dark:text-[#94A3B8] rounded-full px-2 py-1">
                              조회 전용
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 휴가 처리 이력 — 승인/취소 4종(휴가 승인, 신청 거부, 취소 승인, 취소 거부)을 통합 표시.
              각 row의 시간 레이블은 "승인 시간" / "취소 시간"으로 구분되어 동일 휴가가
              승인됐다가 취소된 경우 두 시점이 명확히 보인다. */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(o => !o)}
                className="flex-1 flex items-center justify-between text-sm font-semibold text-[#6B7280] dark:text-[#94A3B8] hover:text-[#374151] dark:hover:text-[#D1D5DB] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4" />
                  휴가 처리 이력
                  <span className="text-xs bg-[#E5E7EB] dark:bg-[#374151] text-[#374151] dark:text-[#D1D5DB] rounded-full px-1.5">
                    {historyItems.length}건
                  </span>
                </span>
                {historyOpen
                  ? <ChevronUp className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />}
              </button>
              <Button
                size="sm"
                variant="outline"
                className="ml-2 h-7 px-2 text-xs"
                onClick={() => setDownloadOpen(true)}
                disabled={historyItems.length === 0}
                title="처리 이력을 CSV로 다운로드 (승인·취소 모두 포함)"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                다운로드
              </Button>
            </div>
            {historyOpen && (
              historyItems.length === 0 ? (
                <div className="text-xs text-[#9CA3AF] dark:text-[#6B7280] bg-[#F9FAFB] dark:bg-[#1E293B]/40 border border-dashed border-[#E5E7EB] dark:border-[#334155] rounded-lg px-4 py-6 text-center">
                  아직 처리 이력이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyItems.map(item => {
                    const startDate = item.event_start_at
                      ? (item.event_is_all_day
                          ? format(parseISO(item.event_start_at), 'M월 d일', { locale: ko })
                          : format(parseISO(item.event_start_at), 'M월 d일 HH:mm', { locale: ko }))
                      : '(일정 정보 없음)'
                    const endDate = item.event_end_at
                      ? (item.event_is_all_day
                          ? format(parseISO(item.event_end_at), 'M월 d일', { locale: ko })
                          : format(parseISO(item.event_end_at), 'HH:mm'))
                      : ''
                    const happenedLabel = item.happened_at
                      ? format(parseISO(item.happened_at), 'yyyy.MM.dd HH:mm', { locale: ko })
                      : '-'
                    // 시간 레이블 구분: 신청 결재(승인/거부) → "승인 시간",
                    //                  취소 결재(승인/거부) → "취소 시간"
                    const timeLabel = (item.kind === 'grant' || item.kind === 'request_rejected') ? '승인 시간' : '취소 시간'
                    const kindStyle = item.kind === 'grant'
                      ? { border: 'border-blue-200 dark:border-blue-800', badge: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40', label: '휴가 승인', icon: <CheckCircle className="h-3 w-3" /> }
                      : item.kind === 'cancel_approved'
                      ? { border: 'border-green-200 dark:border-green-800', badge: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40', label: '취소 승인', icon: <CheckCircle className="h-3 w-3" /> }
                      : item.kind === 'cancel_rejected'
                      ? { border: 'border-[#E5E7EB] dark:border-[#334155]', badge: 'text-[#6B7280] dark:text-[#94A3B8] bg-[#F3F4F6] dark:bg-[#374151]', label: '취소 거부', icon: <XCircle className="h-3 w-3" /> }
                      : { border: 'border-red-200 dark:border-red-800', badge: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40', label: '신청 거부', icon: <XCircle className="h-3 w-3" /> }
                    return (
                      <div key={item.id} className={`bg-white dark:bg-[#1E293B] rounded-lg p-3 border ${kindStyle.border}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          <UserAvatar name={item.requester?.full_name ?? ''} color={item.requester?.color ?? '#6B7280'} size={32} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm dark:text-[#F1F5F9]">{item.requester?.full_name}</p>
                            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                              {item.event_title} · {startDate}
                              {endDate && startDate !== endDate && ` ~ ${endDate}`}
                              {!item.event_is_all_day && <span className="ml-1 text-orange-500">반차</span>}
                            </p>
                            {item.reason && (
                              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-0.5 italic">&quot;{item.reason}&quot;</p>
                            )}
                            <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">
                              <span className="text-[#6B7280] dark:text-[#94A3B8] font-medium">{timeLabel}:</span> {happenedLabel}
                              {item.reviewer?.full_name && ` · ${item.reviewer.full_name}`}
                            </p>
                          </div>
                          <div className="shrink-0">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${kindStyle.badge}`}>
                              {kindStyle.icon}
                              {kindStyle.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>

          <div className="mb-3 flex items-center gap-2 text-sm text-[#6B7280] dark:text-[#94A3B8]">
            <Sun className="h-4 w-4 text-orange-500" />
            <span>{new Date().getFullYear()}년 휴가 할당량 / 결재자 관리</span>
          </div>
          <div className="space-y-2">
            {sortedVacationUsers.map(u => {
              const currentTotal = vacEdits[u.id] ?? u.total_days
              const currentApprover = vacApproverEdits[u.id] ?? (u.approver_id ?? 'admin')
              const isApproverSelfAdmin = currentApprover === 'admin'
              // 본인(관리자)이 결재자일 때만 총휴가 편집 가능
              const canEditDays = isApproverSelfAdmin
              const approverChanged = currentApprover !== (u.approver_id ?? 'admin')
              const totalChanged = currentTotal !== u.total_days && canEditDays
              const isDirty = approverChanged || totalChanged
              const pct = u.total_days > 0 ? Math.min((u.used_days / u.total_days) * 100, 100) : 0
              return (
                <div key={u.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar name={u.full_name} color={u.color} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm dark:text-[#F1F5F9]">{u.full_name}</p>
                      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                        총 {u.total_days}일 · 사용 {u.used_days}일 · 대기{' '}
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">{u.pending_days}일</span>
                        {' · '}잔여{' '}
                        <span className={u.remaining_days <= 0 ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'}>
                          {u.remaining_days}일
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* 결재자 Select */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">결재자</span>
                      <Select
                        value={currentApprover}
                        onValueChange={v => setVacApproverEdits(prev => ({ ...prev, [u.id]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs min-w-[8rem]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">앱관리자(본인)</SelectItem>
                          {vacationUsers
                            .filter(other => other.id !== u.id && other.status === 'active' && (other.role === 'manager' || other.is_super_admin))
                            .map(other => (
                              <SelectItem key={other.id} value={other.id}>{other.full_name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 총휴가 — 본인 결재일 때만 편집 가능 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">총 휴가</span>
                      <Input
                        type="number" min={0} max={365} step={0.1} value={currentTotal}
                        disabled={!canEditDays}
                        onChange={e => {
                          const v = e.target.value
                          setVacEdits(prev => ({
                            ...prev,
                            [u.id]: v === '' ? 0 : Math.round(Number(v) * 10) / 10,
                          }))
                        }}
                        className="w-20 h-8 text-sm text-center disabled:opacity-50"
                      />
                      <span className="text-xs text-[#6B7280]">일</span>
                    </div>

                    {!canEditDays && (
                      <span className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280]">
                        ※ 총휴가는 결재자({vacationUsers.find(v => v.id === currentApprover)?.full_name ?? '—'})가 관리
                      </span>
                    )}

                    <div className="ml-auto">
                      <Button size="sm" disabled={!isDirty || vacSaving === u.id} onClick={() => saveVacation(u.id)}>
                        <Save className="h-4 w-4 mr-1" />
                        {vacSaving === u.id ? '저장 중...' : '저장'}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 bg-[#E5E7EB] dark:bg-[#334155] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {vacationUsers.length === 0 && (
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-6">회원이 없습니다.</p>
            )}
          </div>
        </TabsContent>

        {/* ── 팀 관리 ───────────────────────────────────────── */}
        <TabsContent value="teams">
          <form onSubmit={addTeam} className="flex flex-nowrap items-center gap-2 mb-4">
            <Input
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              placeholder="새 팀명"
              className="flex-1 min-w-0"
            />
            <Button type="submit" size="sm" className="shrink-0 whitespace-nowrap">
              <Plus className="h-4 w-4 mr-1" />생성
            </Button>
          </form>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mb-2">
            ↑↓ 버튼으로 순서를 바꾸면 회원·출근·휴가 관리에서도 이 순서대로 정렬됩니다. 같은 팀 안에서는 가나다순.
          </p>
          <div className="space-y-2">
            {teams.map((team, idx) => (
              <div key={team.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3">
                {/* 순서 변경 버튼 */}
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => reorderTeams(idx, idx - 1)}
                    disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-[#F3F4F6] dark:hover:bg-[#374151] text-[#6B7280] dark:text-[#94A3B8] disabled:opacity-30 disabled:cursor-not-allowed"
                    title="위로"
                    aria-label="위로 이동"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => reorderTeams(idx, idx + 1)}
                    disabled={idx === teams.length - 1}
                    className="p-0.5 rounded hover:bg-[#F3F4F6] dark:hover:bg-[#374151] text-[#6B7280] dark:text-[#94A3B8] disabled:opacity-30 disabled:cursor-not-allowed"
                    title="아래로"
                    aria-label="아래로 이동"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[10px] tabular-nums text-[#9CA3AF] dark:text-[#64748B] w-4 text-right">{idx + 1}</span>
                  <span className="font-medium text-sm dark:text-[#F1F5F9]">{team.name}</span>
                  <span className="text-xs text-[#374151] dark:text-[#D1D5DB] bg-[#F3F4F6] dark:bg-[#374151] border border-[#E5E7EB] dark:border-[#4B5563] rounded px-1.5 py-0.5">
                    [{team.abbreviation ?? team.name.slice(0, 2)}]
                  </span>
                </div>
                <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{users.filter(u => u.team_id === team.id).length}명</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">약어</span>
                  <Input
                    value={teamAbbrEdits[team.id] ?? ''}
                    onChange={e => setTeamAbbrEdits(prev => ({ ...prev, [team.id]: e.target.value }))}
                    className="w-16 h-7 text-xs text-center"
                    maxLength={4}
                    placeholder={team.name.slice(0, 2)}
                  />
                  <Button size="sm" className="h-7 px-2" onClick={() => saveTeamAbbr(team.id)}>
                    <Save className="h-3 w-3" />
                  </Button>
                </div>
                <Button size="sm" variant="danger" onClick={() => setConfirmAction({ type: 'team', id: team.id, name: team.name })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── 카테고리 ──────────────────────────────────────── */}
        <TabsContent value="categories">
          <form onSubmit={addCategory} className="flex flex-nowrap items-center gap-2 mb-4">
            <Input
              value={newCat.name}
              onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))}
              placeholder="카테고리명"
              className="flex-1 min-w-0"
            />
            <input
              type="color"
              value={newCat.color}
              onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))}
              className="h-10 w-10 rounded border cursor-pointer shrink-0"
            />
            <Button type="submit" size="sm" className="shrink-0 whitespace-nowrap">
              <Plus className="h-4 w-4 mr-1" />추가
            </Button>
          </form>
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex items-center gap-3">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm font-medium dark:text-[#F1F5F9]">{cat.name}</span>
                {cat.is_default && <Badge variant="outline" className="text-xs">기본</Badge>}
                {!cat.is_default && (
                  <Button size="sm" variant="danger" onClick={() => setConfirmAction({ type: 'category', id: cat.id, name: cat.name })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── 인사관리 ─────────────────────────────────────── */}
        <TabsContent value="hr">
          <div className="mb-3 flex items-center gap-2">
            <IdCard className="h-4 w-4 text-[#2563EB]" />
            <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">
              회원 인사기록
            </h2>
            <span className="ml-auto text-[11px] text-[#9CA3AF] dark:text-[#64748B]">
              회원 옆 인사기록 버튼으로 입력·수정·삭제
            </span>
          </div>
          <div className="space-y-2">
            {sortedActive.length === 0 ? (
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-6">
                등록된 회원이 없습니다.
              </p>
            ) : sortedActive.map(user => (
              <div
                key={user.id}
                className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3"
              >
                <UserAvatar name={user.full_name} color={user.color} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm dark:text-[#F1F5F9] truncate">{user.full_name}</p>
                  <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">
                    {(user.team as any)?.name ?? '팀 없음'}
                    {user.email && <> · {user.email}</>}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openHrModal(user)}>
                  <IdCard className="h-3.5 w-3.5 mr-1" />인사기록
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── 회사 설정 ─────────────────────────────────────── */}
        <TabsContent value="settings">
          <form onSubmit={saveSettings} className="space-y-4 max-w-md">

            {/* IP 설정 — cg_office_networks 행 단위 관리 */}
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wifi className="h-4 w-4 text-[#2563EB]" />
                  <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">허용 IP 주소</h2>
                </div>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  사무실에서 외부로 보이는 공인 IP를 등록하세요. 단일 IP는 자동으로 /32로 처리되며, /24 등 CIDR도 지원합니다.
                </p>

                <Button type="button" variant="outline" className="w-full" onClick={addCurrentIpAsNetwork} disabled={networkAdding}>
                  <Wifi className="h-4 w-4 mr-2" />
                  현재 내 IP 자동 등록
                </Button>

                {/* 수동 추가 폼 */}
                <div onClick={e => e.stopPropagation()} className="flex flex-wrap gap-2 items-end pt-1">
                  <div className="flex-1 min-w-[8rem]">
                    <label className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] mb-1">IP / CIDR</label>
                    <Input
                      value={newNetworkCidr}
                      onChange={e => setNewNetworkCidr(e.target.value)}
                      placeholder="예: 211.219.53.239 또는 203.0.113.0/24"
                      className="text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[6rem]">
                    <label className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] mb-1">라벨</label>
                    <Input
                      value={newNetworkLabel}
                      onChange={e => setNewNetworkLabel(e.target.value)}
                      placeholder="예: 본사"
                      className="text-sm"
                    />
                  </div>
                  <Button type="button" size="sm" onClick={addNetworkManual} disabled={networkAdding || !newNetworkCidr.trim()}>
                    <Plus className="h-4 w-4 mr-1" />추가
                  </Button>
                </div>

                {/* 등록 목록 */}
                <div className="space-y-2 pt-1">
                  {networks.length === 0 ? (
                    <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] border border-dashed border-[#E5E7EB] dark:border-[#334155] px-3 py-4 text-center text-xs text-[#9CA3AF] dark:text-[#6B7280]">
                      등록된 IP가 없습니다. 위에서 추가해 주세요.
                    </div>
                  ) : networks.map(n => {
                    const labelEdit = networkLabelEdits[n.id] ?? ''
                    const labelDirty = labelEdit !== (n.label ?? '')
                    const lastMatch = n.last_matched_at
                      ? format(parseISO(n.last_matched_at), 'yyyy.MM.dd HH:mm', { locale: ko })
                      : '—'
                    return (
                      <div key={n.id} className="bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-[8rem]">
                          <p className="font-mono text-xs font-medium text-[#111827] dark:text-[#F1F5F9]">{n.cidr}</p>
                          <p className="text-[10px] text-[#9CA3AF] dark:text-[#6B7280] mt-0.5">
                            최근 매칭: {lastMatch}
                          </p>
                        </div>
                        <Input
                          value={labelEdit}
                          onChange={e => setNetworkLabelEdits(prev => ({ ...prev, [n.id]: e.target.value }))}
                          placeholder="라벨"
                          className="h-7 text-xs w-24"
                        />
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          disabled={!labelDirty || networkSaving === n.id}
                          onClick={() => saveNetworkLabel(n.id)}
                          title="라벨 저장"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="h-7 px-2"
                          onClick={() => deleteNetwork(n.id)}
                          title="삭제"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>

            <Button type="submit" className="w-full max-w-md" disabled={!settingsDirty || settingsSaving}>
              <Save className="h-4 w-4 mr-2" />
              {settingsSaving ? '저장 중...' : '설정 저장'}
            </Button>
          </form>

          {/* 등록된 PC / 등록 요청 — 사무실 IP 설정 아래 */}
          {(() => {
            const pendingDevices = devices.filter(d => d.status === 'pending')
            const approvedDevices = devices.filter(d => d.status === 'approved')
            const rejectedDevices = devices.filter(d => d.status === 'rejected')

            const renderDeviceRow = (d: OfficeDevice) => {
              const labelEdit = deviceLabelEdits[d.id] ?? ''
              const labelDirty = labelEdit !== (d.device_label ?? '')
              const lastUsed = d.last_used_at
                ? format(parseISO(d.last_used_at), 'yyyy.MM.dd HH:mm', { locale: ko })
                : '—'
              const requestedAt = format(parseISO(d.requested_at), 'yyyy.MM.dd HH:mm', { locale: ko })
              return (
                <div key={d.id} className="bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <UserAvatar name={d.user?.full_name ?? '알 수 없음'} color={d.user?.color ?? '#9CA3AF'} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9] truncate">
                        {d.user?.full_name ?? '알 수 없음'}
                        {d.device_label && <span className="ml-1 text-[10px] font-normal text-[#6B7280] dark:text-[#94A3B8]">· {d.device_label}</span>}
                      </p>
                      <p className="text-[10px] text-[#9CA3AF] dark:text-[#64748B]">
                        요청: {requestedAt}{d.status === 'approved' && ` · 최근 사용: ${lastUsed}`}
                      </p>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-[#6B7280] dark:text-[#94A3B8] break-all leading-snug">
                    UA: {d.user_agent.slice(0, 90)}{d.user_agent.length > 90 ? '…' : ''}
                  </div>
                  {d.last_ip && (
                    <div className="text-[10px] font-mono text-[#9CA3AF] dark:text-[#64748B]">
                      IP: {d.last_ip}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5 items-center">
                    <Input
                      value={labelEdit}
                      onChange={e => setDeviceLabelEdits(prev => ({ ...prev, [d.id]: e.target.value }))}
                      placeholder="PC 라벨"
                      className="h-7 text-xs flex-1 min-w-[6rem]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2"
                      disabled={!labelDirty || deviceProcessing === d.id}
                      onClick={() => handleDeviceLabelSave(d.id)}
                      title="라벨 저장"
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                    {d.status !== 'approved' && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 bg-green-600 hover:bg-green-700"
                        disabled={deviceProcessing === d.id}
                        onClick={() => handleDeviceAction(d.id, 'approve')}
                        title="승인"
                      >
                        <Check className="h-3 w-3 mr-1" />승인
                      </Button>
                    )}
                    {d.status !== 'rejected' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-amber-600 border-amber-300"
                        disabled={deviceProcessing === d.id}
                        onClick={() => handleDeviceAction(d.id, 'reject')}
                        title="거절"
                      >
                        <ShieldAlert className="h-3 w-3 mr-1" />거절
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      className="h-7 px-2"
                      disabled={deviceProcessing === d.id}
                      onClick={() => handleDeviceDelete(d.id)}
                      title="삭제"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div className="mt-6 max-w-md space-y-4">
                {/* (1) 등록 요청 대기 */}
                <div className="bg-white dark:bg-[#1E293B] border border-amber-200 dark:border-amber-900/50 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">등록 요청 (승인 대기)</h2>
                    <Badge variant="outline" className="ml-auto text-[10px] border-amber-400 text-amber-600 dark:text-amber-400">
                      {pendingDevices.length}건
                    </Badge>
                  </div>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
                    사무실 네트워크에서 직원이 등록 요청한 PC입니다. 승인하면 출근 체크 가능 대상이 됩니다.
                  </p>
                  {pendingDevices.length === 0 ? (
                    <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] border border-dashed border-[#E5E7EB] dark:border-[#334155] px-3 py-3 text-center text-xs text-[#9CA3AF] dark:text-[#6B7280]">
                      대기 중인 등록 요청이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingDevices.map(renderDeviceRow)}
                    </div>
                  )}
                </div>

                {/* (2) 등록된 PC (승인됨) */}
                <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-green-600" />
                    <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">등록된 PC (승인됨)</h2>
                    <Badge variant="outline" className="ml-auto text-[10px] border-green-400 text-green-600 dark:text-green-400">
                      {approvedDevices.length}대
                    </Badge>
                  </div>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
                    승인된 PC 목록입니다. 승인 필수 모드 ON 일 때는 이 PC들에서만 출근 체크가 됩니다.
                  </p>
                  {approvedDevices.length === 0 ? (
                    <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] border border-dashed border-[#E5E7EB] dark:border-[#334155] px-3 py-3 text-center text-xs text-[#9CA3AF] dark:text-[#6B7280]">
                      아직 등록된 PC가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {approvedDevices.map(renderDeviceRow)}
                    </div>
                  )}
                </div>

                {/* (3) 거절된 요청 — 접힘 */}
                {rejectedDevices.length > 0 && (
                  <details className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5">
                    <summary className="flex items-center gap-2 cursor-pointer">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">거절된 요청</h2>
                      <Badge variant="outline" className="ml-auto text-[10px] border-red-400 text-red-600 dark:text-red-400">
                        {rejectedDevices.length}건
                      </Badge>
                    </summary>
                    <div className="space-y-2 mt-3">
                      {rejectedDevices.map(renderDeviceRow)}
                    </div>
                  </details>
                )}
              </div>
            )
          })()}
        </TabsContent>
      </Tabs>

      {/* 승인 완료 팝업 — 확인 시
            1) 대기 목록을 fetchAll 로 다시 불러와 처리된 건이 사라지게 한다
            2) 부가 다이얼로그(다운로드/이력 토글 등)를 모두 리셋한다
            3) 휴가 관리 탭으로 자동 전환해 결과를 바로 확인할 수 있게 한다 */}
      {(() => {
        const finishApprove = () => {
          setApproveComplete(null)
          // 다른 다이얼로그/패널 리셋
          setDownloadOpen(false)
          setHistoryOpen(false)
          // 휴가 관리 탭으로 이동
          setActiveTab('vacation')
          fetchAll()
        }
        return (
          <Dialog
            open={approveComplete !== null}
            onOpenChange={open => { if (!open) finishApprove() }}
          >
            <DialogContent className="max-w-xs text-center">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40">
                  <CheckCircle className="h-9 w-9 text-green-500" />
                </div>
                <DialogTitle className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">승인 완료</DialogTitle>
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
                  {approveComplete?.kind === 'cancel'
                    ? '휴가 취소가 승인되었습니다.'
                    : '휴가 신청이 승인되었습니다.'}
                </p>
                <Button className="w-full mt-2" onClick={finishApprove}>
                  확인
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* 휴가 처리 이력 다운로드 다이얼로그 */}
      <Dialog open={downloadOpen} onOpenChange={open => { if (!open) setDownloadOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              휴가 처리 이력 다운로드
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              선택한 기간 안의 휴가 승인·취소 이력이 한 CSV 파일로 저장됩니다.
              각 행에는 &quot;승인 시간&quot;과 &quot;취소 시간&quot; 컬럼이 따로 표시됩니다.
            </p>

            <div className="space-y-2">
              {([
                { key: '1m', label: '직전 1개월' },
                { key: '3m', label: '직전 3개월' },
                { key: 'custom', label: '기간 직접 설정' },
              ] as const).map(opt => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    downloadPeriod === opt.key
                      ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A5F] text-[#2563EB] dark:text-[#93C5FD]'
                      : 'border-[#E5E7EB] dark:border-[#334155] text-[#374151] dark:text-[#D1D5DB] hover:border-[#9CA3AF]'
                  }`}
                >
                  <input
                    type="radio"
                    name="download-period"
                    value={opt.key}
                    checked={downloadPeriod === opt.key}
                    onChange={() => setDownloadPeriod(opt.key)}
                    className="accent-[#2563EB]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            {downloadPeriod === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] mb-1">시작일</label>
                  <Input
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] mb-1">종료일</label>
                  <Input
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={e => setCustomTo(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            {/* 본인 결재(자기결재 자동 승인) 포함 여부 — 결재자/앱관리자가 본인 휴가를
                자동 승인한 건은 reviewer 가 없다. 기본은 포함. */}
            <label className="flex items-center gap-2 pt-1 cursor-pointer text-sm text-[#374151] dark:text-[#D1D5DB]">
              <input
                type="checkbox"
                checked={includeSelfApproved}
                onChange={e => setIncludeSelfApproved(e.target.checked)}
                className="h-4 w-4 accent-[#2563EB]"
              />
              <span>본인 결재(자기 결재 자동 승인) 포함</span>
            </label>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDownloadOpen(false)}>
                취소
              </Button>
              <Button className="flex-1" onClick={downloadHistoryCSV}>
                <Download className="h-4 w-4 mr-1" />
                다운로드
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 출근 이력 다운로드 다이얼로그 */}
      <Dialog open={attendanceDownloadOpen} onOpenChange={open => { if (!open) setAttendanceDownloadOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              출근 이력 다운로드
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
              다운로드할 기간을 선택하세요. CSV 파일로 저장됩니다.
            </p>

            <div className="space-y-2">
              {([
                { key: '1m', label: '직전 1개월' },
                { key: '3m', label: '직전 3개월' },
                { key: 'custom', label: '기간 직접 설정' },
              ] as const).map(opt => (
                <label
                  key={opt.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    attDownloadPeriod === opt.key
                      ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A5F] text-[#2563EB] dark:text-[#93C5FD]'
                      : 'border-[#E5E7EB] dark:border-[#334155] text-[#374151] dark:text-[#D1D5DB] hover:border-[#9CA3AF]'
                  }`}
                >
                  <input
                    type="radio"
                    name="att-download-period"
                    value={opt.key}
                    checked={attDownloadPeriod === opt.key}
                    onChange={() => setAttDownloadPeriod(opt.key)}
                    className="accent-[#2563EB]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            {attDownloadPeriod === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] mb-1">시작일</label>
                  <Input
                    type="date"
                    value={attCustomFrom}
                    max={attCustomTo || undefined}
                    onChange={e => setAttCustomFrom(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#6B7280] dark:text-[#94A3B8] mb-1">종료일</label>
                  <Input
                    type="date"
                    value={attCustomTo}
                    min={attCustomFrom || undefined}
                    onChange={e => setAttCustomTo(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setAttendanceDownloadOpen(false)}>
                취소
              </Button>
              <Button className="flex-1" onClick={downloadAttendanceCSV}>
                <Download className="h-4 w-4 mr-1" />
                다운로드
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!confirmAction} onOpenChange={open => { if (!open) setConfirmAction(null) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{confirmAction?.type === 'team' ? '팀 삭제' : '카테고리 삭제'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
            <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{confirmAction?.name}</span>
            {confirmAction?.type === 'team'
              ? '을(를) 삭제하시겠습니까? 팀 삭제 후 소속 인원은 팀 없음 상태가 됩니다.'
              : '을(를) 삭제하시겠습니까?'}
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>취소</Button>
            <Button
              className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 비밀번호 초기화 확인 모달 ────────────────────── */}
      <Dialog open={!!pwResetConfirm} onOpenChange={open => { if (!open) setPwResetConfirm(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#0E7690]" />
              비밀번호 초기화
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#374151] dark:text-[#D1D5DB] leading-relaxed">
            <span className="font-semibold text-[#111827] dark:text-[#F1F5F9]">{pwResetConfirm?.name}</span>
            님의 비밀번호를 <code className="font-mono font-semibold text-[#0E7490] dark:text-[#67E8F9] bg-[#ECFEFF] dark:bg-[#0E7690]/20 px-1.5 py-0.5 rounded">password</code> 로 초기화하시겠습니까?
          </p>
          <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] leading-relaxed">
            초기화 후, 해당 회원에게 <strong>password</strong> 로 로그인한 뒤 프로필 화면에서 새 비밀번호로 변경하라고 안내해 주세요. (이메일 발송은 일어나지 않습니다)
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setPwResetConfirm(null)}>취소</Button>
            <Button
              className="flex-1"
              disabled={pwResetting !== null}
              onClick={() => pwResetConfirm && resetPassword(pwResetConfirm.id)}
            >
              {pwResetting ? '변경 중...' : '초기화'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 인사관리 모달 */}
      <Dialog open={hrModalUser !== null} onOpenChange={open => { if (!open) closeHrModal() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-[#2563EB]" />
              인사기록
              {hrModalUser && (
                <span className="text-sm font-normal text-[#6B7280] dark:text-[#94A3B8]">
                  · {hrModalUser.full_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {hrLoading ? (
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-6">불러오는 중...</p>
          ) : (
            <div className="space-y-3 py-2">
              {/* 회원 본인 화면과 동일한 프로필 정보(읽기 전용) */}
              {hrModalUser && (
                <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] p-3 space-y-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    <UserAvatar name={hrModalUser.full_name} color={hrModalUser.color} size={32} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9] truncate">{hrModalUser.full_name}</p>
                      <p className="text-[11px] text-[#6B7280] dark:text-[#94A3B8] truncate">{hrModalUser.email ?? '이메일 없음'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div>
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">직책</span>
                      <span className="ml-1.5 font-medium text-[#111827] dark:text-[#F1F5F9]">
                        {(hrModalUser as any).is_super_admin ? '앱관리자' : hrModalUser.role === 'manager' ? '관리자' : hrModalUser.role === 'admin' ? '앱관리자' : '실무자'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">소속 팀</span>
                      <span className="ml-1.5 font-medium text-[#111827] dark:text-[#F1F5F9]">
                        {(hrModalUser.team as any)?.name ?? '팀 없음'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">주민등록번호</label>
                <Input
                  value={hrEdit.resident_id ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, resident_id: e.target.value }))}
                  placeholder="예: 880101-1234567"
                  className="text-sm"
                  autoComplete="off"
                />
                <p className="mt-1 text-[10px] text-[#9CA3AF] dark:text-[#64748B]">본인 화면에는 880101-1****** 형태로 마스킹되어 표시됩니다.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">핸드폰번호</label>
                <Input
                  value={hrEdit.phone ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, phone: e.target.value }))}
                  placeholder="예: 010-1234-5678"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">주소</label>
                <Input
                  value={hrEdit.address ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, address: e.target.value }))}
                  placeholder="예: 서울특별시 ..."
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">비상연락처 (가족)</label>
                <Input
                  value={hrEdit.emergency_contact ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, emergency_contact: e.target.value }))}
                  placeholder="예: 배우자 010-0000-0000"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">입사일자</label>
                <Input
                  type="date"
                  value={hrEdit.hire_date ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, hire_date: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">입사직급</label>
                <Input
                  value={hrEdit.hire_position ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, hire_position: e.target.value }))}
                  placeholder="예: 사원, 대리, 과장"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">학력 (최대 {EDUCATION_ROWS}행)</label>
                <div className="space-y-1.5">
                  {hrEdit.education.map((v, i) => (
                    <Input
                      key={`edu-${i}`}
                      value={v}
                      onChange={e => setHrEdit(s => {
                        const next = [...s.education]
                        next[i] = e.target.value
                        return { ...s, education: next }
                      })}
                      placeholder={i === 0 ? '예: AA대학교 BB학과 학사 2000.03~2002.02' : ''}
                      className="text-sm"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">경력 (최대 {CAREER_ROWS}행)</label>
                <div className="space-y-1.5">
                  {hrEdit.career.map((v, i) => (
                    <Input
                      key={`car-${i}`}
                      value={v}
                      onChange={e => setHrEdit(s => {
                        const next = [...s.career]
                        next[i] = e.target.value
                        return { ...s, career: next }
                      })}
                      placeholder={i === 0 ? '예: CC보험 일반보험 2010.03~2020.12' : ''}
                      className="text-sm"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">자격증 (최대 {CERTIFICATE_ROWS}행)</label>
                <div className="space-y-1.5">
                  {hrEdit.certificates.map((v, i) => (
                    <Input
                      key={`cert-${i}`}
                      value={v}
                      onChange={e => setHrEdit(s => {
                        const next = [...s.certificates]
                        next[i] = e.target.value
                        return { ...s, certificates: next }
                      })}
                      placeholder={i === 0 ? '예: 정보처리기사 KISA 2015.05' : ''}
                      className="text-sm"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] dark:text-[#D1D5DB] mb-1">메모</label>
                <textarea
                  value={hrEdit.notes ?? ''}
                  onChange={e => setHrEdit(s => ({ ...s, notes: e.target.value }))}
                  placeholder="예: 승진 이력, 연봉 변동 등"
                  rows={3}
                  className="w-full text-sm rounded-md border border-[#E5E7EB] dark:border-[#334155] bg-white dark:bg-[#0F172A] dark:text-[#F1F5F9] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {hrConfirmDelete ? (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-3 space-y-2">
                  <p className="text-xs text-red-700 dark:text-red-300">
                    이 회원의 인사기록 전체를 삭제합니다. 되돌릴 수 없습니다.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setHrConfirmDelete(false)}
                      disabled={hrSaving}
                    >
                      취소
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-[#EF4444] hover:bg-[#DC2626] text-white"
                      onClick={deleteHrRecord}
                      disabled={hrSaving}
                    >
                      {hrSaving ? '삭제 중...' : '삭제 확정'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-2">
                  {hrHasRecord && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                      onClick={() => setHrConfirmDelete(true)}
                      disabled={hrSaving}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={closeHrModal}
                    disabled={hrSaving}
                  >
                    닫기
                  </Button>
                  <Button className="flex-1" onClick={saveHrRecord} disabled={hrSaving}>
                    <Save className="h-4 w-4 mr-1" />
                    {hrSaving ? '저장 중...' : (hrHasRecord ? '수정' : '저장')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ToastComponent}
    </div>
  )
}
