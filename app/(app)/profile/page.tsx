'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Eye, EyeOff, KeyRound } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { USER_COLOR_PALETTE } from '@/types/app'
import { cn } from '@/lib/utils/cn'
import type { ProfileWithTeam, Team } from '@/types/app'

const ROLE_LABEL = { admin: '관리자', manager: '팀장', member: '팀원' }

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
  const { showToast, ToastComponent } = useToast()

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
    })
    Promise.all([
      fetch('/api/profiles').then(r => r.json()),
      fetch('/api/admin/teams').then(r => r.json()),
    ]).then(([profileData, teamsData]: [ProfileWithTeam, Team[]]) => {
      setProfile(profileData)
      setForm({
        full_name: profileData.full_name,
        color: profileData.color,
        team_id: profileData.team_id ?? 'none',
      })
      setTeams(Array.isArray(teamsData) ? teamsData : [])
    })
  }, [])

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
      setTimeout(() => router.back(), 600)
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

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#111827]">프로필 설정</h1>
        <Button variant="outline" size="sm" onClick={handleCancel}>
          <X className="h-4 w-4 mr-1" />닫기
        </Button>
      </div>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
        <div className="flex flex-col items-center mb-6">
          <UserAvatar name={form.full_name || profile.full_name} color={form.color} size={64} className="mb-2" />
          <p className="text-sm text-[#6B7280]">
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
            <label className="block text-sm font-medium mb-1 text-[#6B7280]">이메일</label>
            <p className="text-sm text-[#111827]">{email || '불러오는 중...'}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>취소</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
      {/* 비밀번호 변경 */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-[#6B7280]" />
          <h2 className="text-sm font-semibold text-[#111827]">비밀번호 변경</h2>
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
          <Button type="submit" className="w-full" disabled={pwLoading}>
            {pwLoading ? '변경 중...' : '비밀번호 변경'}
          </Button>
        </form>
      </div>

      {ToastComponent}
    </div>
  )
}
