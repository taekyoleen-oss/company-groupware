'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  X, Eye, EyeOff, KeyRound, Palmtree, CalendarDays,
  ChevronDown, ChevronUp, MapPin, CheckCircle2, Navigation, Clock, Wifi,
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { USER_COLOR_PALETTE } from '@/types/app'
import { cn } from '@/lib/utils/cn'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { ProfileWithTeam, Team } from '@/types/app'

const ROLE_LABEL = { admin: '관리자', manager: '팀장', member: '팀원' }

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

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileWithTeam | null>(null)
  const [email, setEmail] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [form, setForm] = useState({ full_name: '', color: '', team_id: 'none' })
  const [loading, setLoading] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })
  const [pwOpen, setPwOpen] = useState(false)
  const [vacSummary, setVacSummary] = useState<VacSummary | null>(null)
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle')
  const [ipStatus, setIpStatus] = useState<IpStatus>('idle')
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [todayAttendance, setTodayAttendance] = useState<{ checked_in_at: string; method?: string } | null>(null)
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const { showToast, ToastComponent } = useToast()

  const checkGps = (settings: CompanySettings) => {
    if (!settings.latitude || !settings.longitude) {
      setGpsStatus('no_setting')
      return
    }
    if (!navigator.geolocation) {
      setGpsStatus('error')
      return
    }
    setGpsStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          settings.latitude!,
          settings.longitude!
        )
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
      setIpStatus(data.allowed ? 'allowed' : 'denied')
    } catch {
      setIpStatus('denied')
    }
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
      ProfileWithTeam, Team[], VacSummary, CompanySettings, { checked_in_at: string; method?: string } | null
    ]) => {
      setProfile(profileData)
      setForm({
        full_name: profileData.full_name,
        color: profileData.color,
        team_id: profileData.team_id ?? 'none',
      })
      setTeams(Array.isArray(teamsData) ? teamsData : [])
      if (vacData && typeof vacData.total_days === 'number') setVacSummary(vacData)
      setCompanySettings(settingsData)
      setTodayAttendance(attendanceData)
      if (settingsData) {
        if (settingsData.attendance_method === 'ip') {
          if (!attendanceData) checkIp()
        } else {
          if (!settingsData.latitude || !settingsData.longitude) {
            setGpsStatus('no_setting')
          } else if (attendanceData) {
            setGpsStatus('idle')
          } else {
            checkGps(settingsData)
          }
        }
      }
    })
  }, [])

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
      showToast('출석이 확인되었습니다.', 'success')
    } else if (res.status === 409) {
      setTodayAttendance({ checked_in_at: data.checked_in_at, method: data.method })
      showToast('이미 출석 처리되었습니다.', 'success')
    } else {
      showToast(data.error ?? '출석 확인에 실패했습니다.', 'error')
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
      setTimeout(() => {
        router.refresh()
        router.back()
      }, 600)
    } else {
      showToast('저장에 실패했습니다.', 'error')
    }
    setLoading(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.next !== pwForm.confirm) {
      showToast('새 비밀번호가 일치하지 않습니다.', 'error'); return
    }
    if (pwForm.next.length < 6) {
      showToast('새 비밀번호는 6자 이상이어야 합니다.', 'error'); return
    }
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
      setPwOpen(false)
    } else {
      showToast(data.error ?? '변경에 실패했습니다.', 'error')
    }
    setPwLoading(false)
  }

  const handleCancel = () => {
    if (profile) {
      setForm({
        full_name: profile.full_name,
        color: profile.color,
        team_id: profile.team_id ?? 'none',
      })
    }
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9]">프로필 설정</h1>
        <Button variant="outline" size="sm" onClick={handleCancel}>
          <X className="h-4 w-4 mr-1" />닫기
        </Button>
      </div>

      {/* 프로필 설정 */}
      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6">
        <div className="flex flex-col items-center mb-6">
          <UserAvatar name={form.full_name || profile.full_name} color={form.color} size={64} className="mb-2" />
          <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
            {ROLE_LABEL[profile.role]}
            {profile.team ? ` · ${(profile.team as any).name}` : ''}
          </p>
        </div>
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
              <SelectTrigger>
                <SelectValue placeholder="팀 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">팀 없음</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-[#6B7280] dark:text-[#94A3B8]">이메일</label>
            <p className="text-sm text-[#111827] dark:text-[#E2E8F0]">{email || '불러오는 중...'}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>취소</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>

      {/* 출석 확인 */}
      {companySettings !== null && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6 mt-4">
          <div className="flex items-center gap-2 mb-4">
            {companySettings.attendance_method === 'ip'
              ? <Wifi className="h-4 w-4 text-blue-500" />
              : <MapPin className="h-4 w-4 text-blue-500" />
            }
            <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">오늘 출석 확인</h2>
            <span className="ml-auto text-xs text-[#9CA3AF] dark:text-[#64748B]">
              {getLocalDateStr().replace(/-/g, '.')}
            </span>
          </div>

          {checkedInTime ? (
            <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-950/30 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">출석 완료</p>
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
                  <Wifi className="h-4 w-4 shrink-0" />
                  사무실 네트워크에 연결되어 있습니다.
                </div>
              )}
              {ipStatus === 'denied' && (
                <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] px-4 py-2.5 text-sm flex items-center gap-2 text-[#6B7280] dark:text-[#94A3B8]">
                  <Wifi className="h-4 w-4 shrink-0" />
                  현재 사무실 네트워크에 연결되어 있지 않습니다.
                </div>
              )}
              {ipStatus === 'idle' && (
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
                  출석 확인 버튼을 눌러 네트워크를 확인하세요.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-none"
                  onClick={checkIp}
                  disabled={ipStatus === 'checking'}
                >
                  <Wifi className="h-3.5 w-3.5 mr-1" />
                  재확인
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={ipStatus !== 'allowed' || checkingIn}
                  onClick={handleCheckIn}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {checkingIn ? '처리 중...' : '출석 확인'}
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
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2 animate-pulse">
                  위치 확인 중...
                </p>
              )}
              {gpsStatus === 'error' && (
                <p className="text-sm text-red-500 dark:text-red-400 text-center py-2">
                  위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 허용해 주세요.
                </p>
              )}
              {gpsStatus === 'idle' && (
                <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
                  위치 확인 버튼을 눌러 출석 가능 여부를 확인하세요.
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
                      ? ' — 출석 가능 범위입니다.'
                      : ` — 반경 ${companySettings.radius_meters}m 이내로 이동하세요.`
                    }
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-none"
                  onClick={() => companySettings && checkGps(companySettings)}
                  disabled={gpsStatus === 'checking'}
                >
                  <Navigation className="h-3.5 w-3.5 mr-1" />
                  위치 재확인
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={gpsStatus !== 'near' || checkingIn}
                  onClick={handleCheckIn}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {checkingIn ? '처리 중...' : '출석 확인'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 휴가 현황 */}
      {vacSummary && (
        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] p-6 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Palmtree className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">
              {vacSummary.year}년 휴가 현황
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-[#F9FAFB] dark:bg-[#0F172A] p-3 text-center">
              <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mb-1">총 휴가</p>
              <p className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9]">{vacSummary.total_days}일</p>
            </div>
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 text-center">
              <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">사용</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{vacSummary.used_days}일</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${vacSummary.remaining_days <= 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
              <p className={`text-xs mb-1 ${vacSummary.remaining_days <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>잔여</p>
              <p className={`text-xl font-bold ${vacSummary.remaining_days <= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {vacSummary.remaining_days}일
              </p>
            </div>
          </div>

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
                      <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
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
        </div>
      )}

      {/* 비밀번호 변경 (접기/펼치기) */}
      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] mt-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setPwOpen(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
            <span className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">비밀번호 변경</span>
          </div>
          {pwOpen
            ? <ChevronUp className="h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
            : <ChevronDown className="h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
          }
        </button>

        {pwOpen && (
          <div className="px-6 pb-6 border-t border-[#E5E7EB] dark:border-[#334155]">
            <form onSubmit={handlePasswordChange} className="space-y-3 pt-4">
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
              <Button type="submit" className="w-full" disabled={pwLoading}>
                {pwLoading ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </form>
          </div>
        )}
      </div>

      {ToastComponent}
    </div>
  )
}
