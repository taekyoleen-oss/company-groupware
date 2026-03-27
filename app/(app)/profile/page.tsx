'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
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
      const data = await res.json()
      setProfile(p => p ? { ...p, ...data } : p)
      showToast('프로필이 저장되었습니다.', 'success')
    } else {
      showToast('저장에 실패했습니다.', 'error')
    }
    setLoading(false)
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
          <p className="text-xs text-[#6B7280]">비밀번호 변경이 필요하면 관리자에게 문의하세요.</p>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>취소</Button>
            <Button type="submit" className="flex-1" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
      {ToastComponent}
    </div>
  )
}
