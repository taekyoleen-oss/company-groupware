'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Settings, Users, Building2, Tag, UserCheck, AlertCircle } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import type { ProfileWithTeam, Team, EventCategory } from '@/types/app'

interface PendingUser {
  id: string
  full_name: string
  color: string
  email?: string | null
}

export function AdminSidebar() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [teamCount, setTeamCount] = useState(0)
  const [categoryCount, setCategoryCount] = useState(0)
  const [approving, setApproving] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [usersRes, teamsRes, catsRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/teams'),
      fetch('/api/admin/categories'),
    ])
    if (usersRes.ok) {
      const data: ProfileWithTeam[] = await usersRes.json()
      if (Array.isArray(data)) {
        setPendingUsers(data.filter(u => u.status === 'pending').slice(0, 5))
      }
    }
    if (teamsRes.ok) {
      const data: Team[] = await teamsRes.json()
      if (Array.isArray(data)) setTeamCount(data.length)
    }
    if (catsRes.ok) {
      const data: EventCategory[] = await catsRes.json()
      if (Array.isArray(data)) setCategoryCount(data.length)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleApprove = async (userId: string) => {
    setApproving(userId)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    setApproving(null)
    if (res.ok) fetchData()
  }

  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 bg-[#F8FAFC] border-l border-[#E5E7EB] p-4 gap-4 overflow-y-auto">

      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-[#6B7280]" />
        <h2 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">관리자 패널</h2>
      </div>

      {/* 대기 중 승인 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[#374151] flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5 text-[#2563EB]" />
            가입 승인 대기
            {pendingUsers.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#EF4444] text-white text-[10px] font-bold">
                {pendingUsers.length}
              </span>
            )}
          </h3>
        </div>

        {pendingUsers.length === 0 ? (
          <p className="text-[10px] text-[#9CA3AF]">대기 중인 회원이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {pendingUsers.map(user => (
              <li key={user.id}
                className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-[#E5E7EB]">
                <UserAvatar name={user.full_name} color={user.color} size={24} />
                <span className="flex-1 text-xs text-[#111827] truncate">{user.full_name}</span>
                <button
                  onClick={() => handleApprove(user.id)}
                  disabled={approving === user.id}
                  className="text-[10px] font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded px-1.5 py-0.5 shrink-0 transition-colors"
                >
                  {approving === user.id ? '…' : '승인'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 구분선 */}
      <div className="border-t border-[#E5E7EB]" />

      {/* 관리 메뉴 링크 */}
      <div>
        <h3 className="text-xs font-semibold text-[#374151] mb-2">빠른 메뉴</h3>
        <nav className="flex flex-col gap-1">
          <Link href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white hover:text-[#2563EB] text-[#374151] transition-colors group border border-transparent hover:border-[#E5E7EB]">
            <Users className="h-4 w-4 text-[#6B7280] group-hover:text-[#2563EB] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">회원 관리</p>
              <p className="text-[10px] text-[#9CA3AF]">권한·팀 설정</p>
            </div>
          </Link>
          <Link href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white hover:text-[#2563EB] text-[#374151] transition-colors group border border-transparent hover:border-[#E5E7EB]">
            <Building2 className="h-4 w-4 text-[#6B7280] group-hover:text-[#2563EB] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">팀 관리</p>
              <p className="text-[10px] text-[#9CA3AF]">팀 {teamCount}개</p>
            </div>
          </Link>
          <Link href="/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white hover:text-[#2563EB] text-[#374151] transition-colors group border border-transparent hover:border-[#E5E7EB]">
            <Tag className="h-4 w-4 text-[#6B7280] group-hover:text-[#2563EB] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">카테고리</p>
              <p className="text-[10px] text-[#9CA3AF]">카테고리 {categoryCount}개</p>
            </div>
          </Link>
        </nav>
      </div>

      {/* 전체 관리자 페이지 */}
      <Link href="/admin"
        className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-[#2563EB] text-[#2563EB] text-xs font-medium py-2 px-3 hover:bg-[#EFF6FF] transition-colors">
        <Settings className="h-3.5 w-3.5" />
        전체 관리자 페이지
      </Link>

    </aside>
  )
}
