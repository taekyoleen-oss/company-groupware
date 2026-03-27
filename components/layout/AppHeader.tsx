'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Calendar, FileText, CheckSquare, User, LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import type { ProfileWithTeam } from '@/types/app'

interface AppHeaderProps {
  profile: ProfileWithTeam
}

const NAV_ITEMS = [
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/notices', label: '공지', icon: FileText },
  { href: '/todo', label: 'TO-DO', icon: CheckSquare },
]

export function AppHeader({ profile }: AppHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E5E7EB] px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/calendar" className="font-bold text-[#2563EB] text-base">
          그룹웨어
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-[#EFF6FF] text-[#2563EB]'
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          {profile.role === 'admin' && (
            <Link
              href="/admin"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/admin') ? 'bg-[#EFF6FF] text-[#2563EB]' : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB]'
              }`}
            >
              <Settings className="h-4 w-4" />
              관리자
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/profile" className="flex items-center gap-2 hover:opacity-80">
          <UserAvatar name={profile.full_name} color={profile.color} size={28} />
          <span className="hidden md:block text-sm text-[#111827]">{profile.full_name}</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={handleSignOut} title="로그아웃">
          <LogOut className="h-4 w-4 text-[#6B7280]" />
        </Button>
      </div>
    </header>
  )
}
