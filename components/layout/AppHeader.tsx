'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, FileText, CheckSquare, LogOut, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/avatar'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { NotificationPanel } from '@/components/messages/NotificationPanel'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { ProfileWithTeam } from '@/types/app'

interface AppHeaderProps {
  profile: ProfileWithTeam
  isApprover?: boolean
}

const NAV_ITEMS = [
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/notices',  label: '공지',   icon: FileText },
  { href: '/todo',     label: 'TO-DO',  icon: CheckSquare },
]

export function AppHeader({ profile, isApprover = false }: AppHeaderProps) {
  const pathname = usePathname()
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const confirmSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E5E7EB] px-4 h-14 flex items-center justify-between dark:bg-[#374151] dark:border-[#4B5563]">
      <div className="flex items-center gap-6">
        <Link href="/calendar" className="flex items-center gap-2 font-bold text-[#2563EB] text-base dark:text-[#60A5FA]">
          <Logo className="h-7 w-7" title="그룹웨어 로고" />
          그룹웨어
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-[#EFF6FF] text-[#2563EB] dark:bg-[#1E3A5F] dark:text-[#93C5FD]'
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9] dark:hover:bg-[#4B5563]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          {isApprover && (
            <Link
              href="/approvals"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/approvals')
                  ? 'bg-[#EFF6FF] text-[#2563EB] dark:bg-[#1E3A5F] dark:text-[#93C5FD]'
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9] dark:hover:bg-[#4B5563]'
              }`}
            >
              <ClipboardCheck className="h-4 w-4" />
              결재함
            </Link>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        {/* 테마 토글 */}
        <ThemeToggle />

        {/* 알림 벨 */}
        <NotificationPanel
          userId={profile.id}
          teamId={profile.team_id ?? null}
        />

        {/* 프로필 — 모바일에서는 하단탭에 프로필이 있으므로 숨김 */}
        <Link href="/profile" className="hidden md:flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#F9FAFB] transition-colors dark:hover:bg-[#4B5563]">
          <UserAvatar name={profile.full_name} color={profile.color} size={28} />
          <span className="hidden md:block text-sm text-[#111827] dark:text-[#F1F5F9]">{profile.full_name}</span>
        </Link>

        {/* 로그아웃 */}
        <Button variant="ghost" size="icon" onClick={() => setShowSignOutConfirm(true)} title="로그아웃">
          <LogOut className="h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
        </Button>
      </div>

      {/* 로그아웃 확인 다이얼로그 */}
      <Dialog open={showSignOutConfirm} onOpenChange={open => { if (!signingOut) setShowSignOutConfirm(open) }}>
        <DialogContent className="max-w-xs text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#EFF6FF] dark:bg-[#1E3A5F]">
              <LogOut className="h-7 w-7 text-[#2563EB] dark:text-[#60A5FA]" />
            </div>
            <DialogTitle className="text-lg font-bold text-[#111827] dark:text-[#F1F5F9]">로그아웃 하시겠어요?</DialogTitle>
            <p className="text-sm text-[#6B7280] dark:text-[#94A3B8]">
              {profile.full_name}님의 계정에서 로그아웃됩니다.
            </p>
            <div className="flex gap-2 w-full mt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSignOutConfirm(false)}
                disabled={signingOut}
              >
                취소
              </Button>
              <Button className="flex-1" onClick={confirmSignOut} disabled={signingOut}>
                {signingOut ? '로그아웃 중...' : '로그아웃'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
