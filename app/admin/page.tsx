'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Trash2, X, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import type { ProfileWithTeam, Team, EventCategory } from '@/types/app'

const STATUS_LABEL = { pending: '대기', active: '활성', inactive: '비활성' }

interface UserEdit {
  role: string
  team_id: string  // 'none' = null
  status: string
  dirty: boolean
}

export default function AdminPage() {
  const router = useRouter()
  const { showToast, ToastComponent } = useToast()
  const [users, setUsers] = useState<ProfileWithTeam[]>([])
  const [edits, setEdits] = useState<Record<string, UserEdit>>({})
  const [teams, setTeams] = useState<Team[]>([])
  const [categories, setCategories] = useState<EventCategory[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [newCat, setNewCat] = useState({ name: '', color: '#3B82F6' })
  const [saving, setSaving] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [usersRes, teamsRes, catsRes] = await Promise.all([
      fetch('/api/admin/users'), fetch('/api/admin/teams'), fetch('/api/admin/categories'),
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
    if (teamsRes.ok) setTeams(await teamsRes.json())
    if (catsRes.ok) setCategories(await catsRes.json())
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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
    if (res.ok) {
      showToast('저장되었습니다.', 'success')
      fetchAll()
    } else {
      showToast('저장에 실패했습니다.', 'error')
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

  const addTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTeamName) return
    const res = await fetch('/api/admin/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTeamName }) })
    if (res.ok) { setNewTeamName(''); showToast('팀이 생성되었습니다.', 'success'); fetchAll() }
  }

  const deleteTeam = async (id: string) => {
    if (!confirm('팀을 삭제하시겠습니까?')) return
    await fetch(`/api/admin/teams/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCat.name) return
    const res = await fetch('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCat) })
    if (res.ok) { setNewCat({ name: '', color: '#3B82F6' }); showToast('카테고리가 추가되었습니다.', 'success'); fetchAll() }
  }

  const deleteCategory = async (id: string) => {
    if (!confirm('카테고리를 삭제하시겠습니까?')) return
    await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  const pending = users.filter(u => u.status === 'pending')
  const active = users.filter(u => u.status !== 'pending')

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#111827]">관리자 패널</h1>
        <Button variant="outline" onClick={() => router.push('/calendar')}>
          <X className="h-4 w-4 mr-1" />닫기
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users">
            회원 관리 {pending.length > 0 && <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5">{pending.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="teams">팀 관리</TabsTrigger>
          <TabsTrigger value="categories">카테고리</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          {pending.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-[#F59E0B] mb-2">승인 대기 ({pending.length}명)</h2>
              <div className="space-y-2">
                {pending.map(user => (
                  <div key={user.id} className="bg-white border border-[#E5E7EB] rounded-lg p-3 flex items-center gap-3">
                    <UserAvatar name={user.full_name} color={user.color} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{user.full_name}</p>
                    </div>
                    <Button size="sm" onClick={() => approveUser(user.id)}>
                      <Check className="h-4 w-4 mr-1" />승인
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-[#6B7280] mb-2">전체 회원</h2>
          <div className="space-y-2">
            {active.map(user => {
              const edit = edits[user.id]
              if (!edit) return null
              return (
                <div key={user.id} className="bg-white border border-[#E5E7EB] rounded-lg p-3 flex items-center gap-3">
                  <UserAvatar name={user.full_name} color={user.color} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{user.full_name}</p>
                    <p className="text-xs text-[#6B7280]">{(user.team as any)?.name ?? '팀 없음'}</p>
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
                  <Button
                    size="sm"
                    disabled={!edit.dirty || saving === user.id}
                    onClick={() => saveUser(user.id)}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {saving === user.id ? '저장 중...' : '저장'}
                  </Button>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="teams">
          <form onSubmit={addTeam} className="flex gap-2 mb-4">
            <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="새 팀명" />
            <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" />생성</Button>
          </form>
          <div className="space-y-2">
            {teams.map(team => (
              <div key={team.id} className="bg-white border border-[#E5E7EB] rounded-lg p-3 flex items-center gap-3">
                <span className="flex-1 font-medium text-sm">{team.name}</span>
                <span className="text-xs text-[#6B7280]">{users.filter(u => u.team_id === team.id).length}명</span>
                <Button size="sm" variant="danger" onClick={() => deleteTeam(team.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <form onSubmit={addCategory} className="flex gap-2 mb-4">
            <Input value={newCat.name} onChange={e => setNewCat(c => ({ ...c, name: e.target.value }))} placeholder="카테고리명" />
            <input type="color" value={newCat.color} onChange={e => setNewCat(c => ({ ...c, color: e.target.value }))} className="h-10 w-10 rounded border cursor-pointer" />
            <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" />추가</Button>
          </form>
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="bg-white border border-[#E5E7EB] rounded-lg p-3 flex items-center gap-3">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm font-medium">{cat.name}</span>
                {cat.is_default && <Badge variant="outline" className="text-xs">기본</Badge>}
                {!cat.is_default && (
                  <Button size="sm" variant="danger" onClick={() => deleteCategory(cat.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {ToastComponent}
    </div>
  )
}
