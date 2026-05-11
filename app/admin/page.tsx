'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Plus, Trash2, X, Save, Sun, MapPin, Navigation, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList, Settings, Clock, CheckCircle, XCircle, Wifi } from 'lucide-react'
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

interface VacationUser {
  id: string
  full_name: string
  color: string
  team_id: string | null
  role: string
  status: string
  total_days: number
  used_days: number
  remaining_days: number
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
  requester: { id: string; full_name: string; color: string }
  reviewer: { id: string; full_name: string; color: string } | null
  event: { id: string; title: string; start_at: string; end_at: string; is_all_day: boolean } | null
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
  method: string | null
}

interface CompanySettings {
  address: string
  latitude: number | null
  longitude: number | null
  radius_meters: number
  attendance_method: 'gps' | 'ip'
  office_ips: string
}

const STATUS_LABEL = { pending: '대기', active: '활성', inactive: '비활성' }

interface UserEdit {
  role: string
  team_id: string
  status: string
  dirty: boolean
}

type ConfirmAction =
  | { type: 'team'; id: string; name: string }
  | { type: 'category'; id: string; name: string }

function toLocalDateStr(d: Date = new Date()) {
  return d.toLocaleDateString('sv-SE') // YYYY-MM-DD
}

export default function AdminPage() {
  const router = useRouter()
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
  const [vacSaving, setVacSaving] = useState<string | null>(null)
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([])
  const [cancelProcessing, setCancelProcessing] = useState<string | null>(null)
  const [approveSuccessOpen, setApproveSuccessOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // 출석 관리
  const [attendanceDate, setAttendanceDate] = useState<string>(toLocalDateStr())
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // 회사 설정
  const [settings, setSettings] = useState<CompanySettings>({ address: '', latitude: null, longitude: null, radius_meters: 200, attendance_method: 'gps', office_ips: '' })
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    const [usersRes, teamsRes, catsRes, vacRes, cancelRes] = await Promise.all([
      fetch('/api/admin/users'), fetch('/api/admin/teams'), fetch('/api/admin/categories'),
      fetch('/api/admin/vacation'), fetch('/api/vacation-cancel-requests'),
    ])
    if (usersRes.ok) {
      const data: ProfileWithTeam[] = await usersRes.json()
      setUsers(data)
      const initial: Record<string, UserEdit> = {}
      data.forEach(u => {
        initial[u.id] = { role: u.role, team_id: u.team_id ?? 'none', status: u.status, dirty: false }
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
      vacData.forEach(u => { initVac[u.id] = u.total_days })
      setVacEdits(initVac)
    }
    if (cancelRes.ok) setCancelRequests(await cancelRes.json())
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
      setSettings({ ...data, office_ips: data.office_ips ?? '' })
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchAttendance(attendanceDate) }, [fetchAttendance, attendanceDate])
  useEffect(() => { fetchSettings() }, [fetchSettings])

  // 휴가 취소 요청 변경 / 사이드바에서 승인 → 자동 새로고침
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-page-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_vacation_cancel_requests' }, () => fetchAll())
      .subscribe()
    const handler = () => fetchAll()
    window.addEventListener('vacation-cancel-approved', handler)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('vacation-cancel-approved', handler)
    }
  }, [fetchAll])

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
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: edit.role,
        team_id: edit.team_id === 'none' ? null : edit.team_id,
        status: edit.status,
      }),
    })
    setSaving(null)
    if (res.ok) { showToast('저장되었습니다.', 'success'); fetchAll() }
    else showToast('저장에 실패했습니다.', 'error')
  }

  const approveUser = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    if (res.ok) { showToast('승인되었습니다.', 'success'); fetchAll() }
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

    // 옵티미스틱: 상태만 갱신 → 자동으로 처리 이력 섹션으로 이동
    setCancelRequests(prev => prev.map(r =>
      r.id === id
        ? { ...r, status: action === 'approve' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() }
        : r
    ))

    if (action === 'approve') {
      setApproveSuccessOpen(true)
    } else {
      setHistoryOpen(true)
      showToast('취소 신청이 거부되었습니다. 처리 이력에서 확인하실 수 있습니다.', 'success')
    }
  }

  const saveVacation = async (userId: string) => {
    const total = vacEdits[userId]
    if (total === undefined) return
    setVacSaving(userId)
    const res = await fetch(`/api/admin/vacation/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_days: total }),
    })
    setVacSaving(null)
    if (res.ok) { showToast('저장되었습니다.', 'success'); fetchAll() }
    else showToast('저장에 실패했습니다.', 'error')
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

  const useCurrentGPS = () => {
    if (!navigator.geolocation) { showToast('이 브라우저는 GPS를 지원하지 않습니다.', 'error'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings(s => ({ ...s, latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
        setSettingsDirty(true)
        setGpsLoading(false)
        showToast('현재 위치가 입력되었습니다.', 'success')
      },
      () => { showToast('위치 정보를 가져올 수 없습니다.', 'error'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const fillCurrentIp = async () => {
    const res = await fetch('/api/attendance/ip-check')
    if (!res.ok) { showToast('IP를 가져올 수 없습니다.', 'error'); return }
    const { ip } = await res.json()
    setSettings(s => {
      const existing = s.office_ips.split(',').map((x: string) => x.trim()).filter(Boolean)
      if (existing.includes(ip)) { showToast('이미 등록된 IP입니다.', 'error'); return s }
      return { ...s, office_ips: [...existing, ip].join(', ') }
    })
    setSettingsDirty(true)
    showToast(`${ip} 가 추가되었습니다.`, 'success')
  }

  const pending = users.filter(u => u.status === 'pending')
  const active = users.filter(u => u.status !== 'pending')
  const pendingCancelRequests = cancelRequests.filter(r => r.status === 'pending')
  const historyCancelRequests = cancelRequests.filter(r => r.status !== 'pending')
  const totalPending = pending.length + pendingCancelRequests.length

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
            {pendingCancelRequests.length > 0 && <span>휴가 취소 승인 대기 <strong>{pendingCancelRequests.length}건</strong></span>}
          </div>
        </div>
      )}

      <Tabs defaultValue="users">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="users">
            회원 관리 {pending.length > 0 && <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <ClipboardList className="h-3.5 w-3.5 mr-1" />출석 관리
          </TabsTrigger>
          <TabsTrigger value="vacation">
            휴가 관리
            {pendingCancelRequests.length > 0 && (
              <span className="ml-1 text-xs bg-orange-500 text-white rounded-full px-1.5">{pendingCancelRequests.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="teams">팀 관리</TabsTrigger>
          <TabsTrigger value="categories">카테고리</TabsTrigger>
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
            {active.map(user => {
              const edit = edits[user.id]
              if (!edit) return null
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
                  <Badge variant={edit.status === 'active' ? 'success' : 'danger'}>{STATUS_LABEL[edit.status as keyof typeof STATUS_LABEL]}</Badge>
                  <Select value={edit.role} onValueChange={v => setEdit(user.id, { role: v })}>
                    <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">팀원</SelectItem>
                      <SelectItem value="manager">팀장</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={edit.team_id} onValueChange={v => setEdit(user.id, { team_id: v })}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="팀" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">팀 없음</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={edit.status === 'active' ? 'secondary' : 'default'}
                    onClick={() => setEdit(user.id, { status: edit.status === 'active' ? 'inactive' : 'active' })}
                  >
                    {edit.status === 'active' ? '비활성화' : '활성화'}
                  </Button>
                  <Button size="sm" disabled={!edit.dirty || saving === user.id} onClick={() => saveUser(user.id)}>
                    <Save className="h-4 w-4 mr-1" />
                    {saving === user.id ? '저장 중...' : '저장'}
                  </Button>
                </div>
              )
            })}
          </div>
        </TabsContent>

        {/* ── 출석 관리 ─────────────────────────────────────── */}
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
            <span className="ml-auto text-sm text-[#6B7280] dark:text-[#94A3B8]">
              출석 <span className="font-semibold text-green-600">{attendedCount}</span>명
              {' / '}전체 <span className="font-semibold">{attendanceRecords.length}</span>명
            </span>
          </div>

          {attendanceLoading ? (
            <p className="text-sm text-[#6B7280] text-center py-8">불러오는 중...</p>
          ) : (
            <div className="space-y-2">
              {attendanceRecords.map(r => (
                <div key={r.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg px-4 py-3 flex items-center gap-3">
                  <UserAvatar name={r.full_name} color={r.color} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm dark:text-[#F1F5F9]">{r.full_name}</p>
                  </div>
                  {r.checked_in_at ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        출석
                      </span>
                      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                        {format(parseISO(r.checked_in_at), 'HH:mm', { locale: ko })}
                      </span>
                      {r.method === 'office_login' ? (
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded px-1.5 py-0.5">🖥️ 사무실</span>
                      ) : (
                        <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 rounded px-1.5 py-0.5">📍 GPS</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#D1D5DB] dark:bg-[#4B5563] shrink-0" />
                      <span className="text-sm text-[#9CA3AF] dark:text-[#6B7280]">미출석</span>
                    </div>
                  )}
                </div>
              ))}
              {attendanceRecords.length === 0 && (
                <p className="text-sm text-[#6B7280] text-center py-8">활성 회원이 없습니다.</p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── 휴가 관리 ─────────────────────────────────────── */}
        <TabsContent value="vacation">
          {/* 휴가 취소 요청 (대기) */}
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
                    <div key={req.id} className="bg-white dark:bg-[#1E293B] rounded-lg p-3 border border-orange-200 dark:border-orange-800">
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
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white h-8" disabled={isProcessing} onClick={() => handleVacationCancelRequest(req.id, 'approve')}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />승인
                          </Button>
                          <Button size="sm" variant="outline" className="text-[#EF4444] border-[#EF4444] hover:bg-[#FEF2F2] h-8" disabled={isProcessing} onClick={() => handleVacationCancelRequest(req.id, 'reject')}>
                            <XCircle className="h-3.5 w-3.5 mr-1" />거부
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 휴가 취소 처리 이력 (승인/거부) — 항상 표시, 빈 상태 노출 */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className="w-full flex items-center justify-between text-sm font-semibold text-[#6B7280] dark:text-[#94A3B8] mb-2 hover:text-[#374151] dark:hover:text-[#D1D5DB] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" />
                휴가 취소 처리 이력
                <span className="text-xs bg-[#E5E7EB] dark:bg-[#374151] text-[#374151] dark:text-[#D1D5DB] rounded-full px-1.5">
                  {historyCancelRequests.length}건
                </span>
              </span>
              {historyOpen
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
            </button>
            {historyOpen && (
              historyCancelRequests.length === 0 ? (
                <div className="text-xs text-[#9CA3AF] dark:text-[#6B7280] bg-[#F9FAFB] dark:bg-[#1E293B]/40 border border-dashed border-[#E5E7EB] dark:border-[#334155] rounded-lg px-4 py-6 text-center">
                  아직 처리된 휴가 취소 신청이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyCancelRequests.map(req => {
                    const info = eventInfo(req)
                    const isApproved = req.status === 'approved'
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
                    const reviewedLabel = req.reviewed_at
                      ? format(parseISO(req.reviewed_at), 'yyyy.MM.dd HH:mm', { locale: ko })
                      : '-'
                    return (
                      <div key={req.id} className={`bg-white dark:bg-[#1E293B] rounded-lg p-3 border ${
                        isApproved ? 'border-green-200 dark:border-green-800' : 'border-[#E5E7EB] dark:border-[#334155]'
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
                            <p className="text-[11px] text-[#9CA3AF] dark:text-[#6B7280] mt-1">
                              처리: {reviewedLabel}
                              {req.reviewer?.full_name && ` · ${req.reviewer.full_name}`}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded-full">
                                <CheckCircle className="h-3 w-3" />취소완료
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] bg-[#F3F4F6] dark:bg-[#374151] px-2 py-1 rounded-full">
                                <XCircle className="h-3 w-3" />거부됨
                              </span>
                            )}
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
            <span>{new Date().getFullYear()}년 휴가 할당량 관리</span>
          </div>
          <div className="space-y-2">
            {vacationUsers.map(u => {
              const currentTotal = vacEdits[u.id] ?? u.total_days
              const isDirty = currentTotal !== u.total_days
              const pct = u.total_days > 0 ? Math.min((u.used_days / u.total_days) * 100, 100) : 0
              return (
                <div key={u.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar name={u.full_name} color={u.color} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm dark:text-[#F1F5F9]">{u.full_name}</p>
                      <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                        사용 {u.used_days}일 · 잔여{' '}
                        <span className={u.remaining_days <= 0 ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'}>
                          {u.remaining_days}일
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[#6B7280] dark:text-[#94A3B8]">총 휴가</span>
                      <Input
                        type="number" min={0} max={365} value={currentTotal}
                        onChange={e => setVacEdits(prev => ({ ...prev, [u.id]: Number(e.target.value) }))}
                        className="w-16 h-8 text-sm text-center"
                      />
                      <span className="text-xs text-[#6B7280]">일</span>
                    </div>
                    <Button size="sm" disabled={!isDirty || vacSaving === u.id} onClick={() => saveVacation(u.id)}>
                      <Save className="h-4 w-4 mr-1" />
                      {vacSaving === u.id ? '저장 중...' : '저장'}
                    </Button>
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
          <form onSubmit={addTeam} className="flex gap-2 mb-4">
            <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="새 팀명" />
            <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" />생성</Button>
          </form>
          <div className="space-y-2">
            {teams.map(team => (
              <div key={team.id} className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-lg p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
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
          <form onSubmit={addCategory} className="flex gap-2 mb-4">
            <Input value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))} placeholder="카테고리명" />
            <input type="color" value={newCat.color} onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))} className="h-10 w-10 rounded border cursor-pointer" />
            <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" />추가</Button>
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

        {/* ── 회사 설정 ─────────────────────────────────────── */}
        <TabsContent value="settings">
          <form onSubmit={saveSettings} className="space-y-4 max-w-md">

            {/* 출석 체크 방식 선택 */}
            <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Settings className="h-4 w-4 text-[#2563EB]" />
                <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">출석 체크 방식</h2>
              </div>
              <div className="flex gap-3">
                {(['gps', 'ip'] as const).map(method => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => { setSettings(s => ({ ...s, attendance_method: method })); setSettingsDirty(true) }}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      settings.attendance_method === method
                        ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A5F] text-[#2563EB] dark:text-[#93C5FD]'
                        : 'border-[#E5E7EB] dark:border-[#334155] text-[#6B7280] dark:text-[#94A3B8] hover:border-[#9CA3AF]'
                    }`}
                  >
                    {method === 'gps' ? <Navigation className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                    {method === 'gps' ? 'GPS 위치' : '사무실 IP'}
                  </button>
                ))}
              </div>
            </div>

            {/* GPS 설정 */}
            {settings.attendance_method === 'gps' && (
              <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-[#2563EB]" />
                  <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">회사 위치 설정</h2>
                </div>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  GPS 출석 체크 기준 위치입니다. 주소와 좌표를 입력하거나 현재 위치를 사용하세요.
                </p>

                <div>
                  <label className="block text-sm font-medium mb-1">회사 주소</label>
                  <Input
                    value={settings.address}
                    onChange={e => { setSettings(s => ({ ...s, address: e.target.value })); setSettingsDirty(true) }}
                    placeholder="예: 서울시 강남구 테헤란로 123"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">위도 (Latitude)</label>
                    <Input
                      type="number"
                      step="any"
                      value={settings.latitude ?? ''}
                      onChange={e => { setSettings(s => ({ ...s, latitude: e.target.value ? Number(e.target.value) : null })); setSettingsDirty(true) }}
                      placeholder="37.123456"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">경도 (Longitude)</label>
                    <Input
                      type="number"
                      step="any"
                      value={settings.longitude ?? ''}
                      onChange={e => { setSettings(s => ({ ...s, longitude: e.target.value ? Number(e.target.value) : null })); setSettingsDirty(true) }}
                      placeholder="127.123456"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={useCurrentGPS}
                  disabled={gpsLoading}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  {gpsLoading ? 'GPS 확인 중...' : '현재 위치로 자동 입력'}
                </Button>

                <div>
                  <label className="block text-sm font-medium mb-1">출석 인정 반경 (미터)</label>
                  <Input
                    type="number"
                    min={50}
                    max={5000}
                    value={settings.radius_meters}
                    onChange={e => { setSettings(s => ({ ...s, radius_meters: Number(e.target.value) })); setSettingsDirty(true) }}
                  />
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
                    회사 위치로부터 이 반경 내에서 출석 체크가 가능합니다. (기본: 200m)
                  </p>
                </div>

                {settings.latitude && settings.longitude && (
                  <div className="rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A5F] border border-[#BFDBFE] dark:border-[#2563EB] px-3 py-2 text-xs text-[#2563EB] dark:text-[#93C5FD]">
                    위치 설정됨: {settings.latitude.toFixed(6)}, {settings.longitude.toFixed(6)}
                    {' · '}반경 {settings.radius_meters}m
                  </div>
                )}
              </div>
            )}

            {/* IP 설정 */}
            {settings.attendance_method === 'ip' && (
              <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wifi className="h-4 w-4 text-[#2563EB]" />
                  <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">허용 IP 주소 설정</h2>
                </div>
                <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                  사무실 네트워크 IP를 쉼표로 구분하여 입력하세요. 이 IP에서만 출석 체크가 가능합니다.
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1">허용 IP 목록</label>
                  <Input
                    value={settings.office_ips}
                    onChange={e => { setSettings(s => ({ ...s, office_ips: e.target.value })); setSettingsDirty(true) }}
                    placeholder="예: 192.168.1.1, 10.0.0.1"
                  />
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
                    쉼표(,)로 구분하세요.
                  </p>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={fillCurrentIp}>
                  <Wifi className="h-4 w-4 mr-2" />
                  현재 내 IP 자동 추가
                </Button>
                {settings.office_ips && (
                  <div className="rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A5F] border border-[#BFDBFE] dark:border-[#2563EB] px-3 py-2 text-xs text-[#2563EB] dark:text-[#93C5FD]">
                    허용 IP: {settings.office_ips}
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="w-full max-w-md" disabled={!settingsDirty || settingsSaving}>
              <Save className="h-4 w-4 mr-2" />
              {settingsSaving ? '저장 중...' : '설정 저장'}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {/* 승인완료 팝업 — 확인 시 페이지 전체 새로고침 */}
      <Dialog
        open={approveSuccessOpen}
        onOpenChange={open => {
          if (!open) {
            setApproveSuccessOpen(false)
            window.location.reload()
          }
        }}
      >
        <DialogContent className="max-w-xs text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40">
              <CheckCircle className="h-9 w-9 text-green-500" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">승인 완료</DialogTitle>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">휴가 취소가 승인되었습니다.</p>
            <Button
              className="w-full mt-2"
              onClick={() => window.location.reload()}
            >
              확인
            </Button>
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

      {ToastComponent}
    </div>
  )
}
