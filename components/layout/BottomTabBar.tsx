'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, FileText, CheckSquare, User, Settings } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const BASE_TABS = [
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/notices',  label: '공지',   icon: FileText },
  { href: '/todo',     label: 'TO-DO',  icon: CheckSquare },
  { href: '/profile',  label: '프로필', icon: User },
]

interface BottomTabBarProps {
  role?: string
}

export function BottomTabBar({ role }: BottomTabBarProps) {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (role !== 'admin') return
    fetch('/api/admin/users')
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setPendingCount(data.filter(u => u.status === 'pending').length)
        }
      })
      .catch(() => {})
  }, [role])

  const tabs = role === 'admin'
    ? [...BASE_TABS, { href: '/admin', label: '관리자', icon: Settings }]
    : BASE_TABS

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E7EB] flex dark:bg-[#374151] dark:border-[#4B5563]">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        const isAdmin = href === '/admin'
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors',
              active
                ? 'text-[#2563EB] dark:text-[#60A5FA]'
                : 'text-[#6B7280] dark:text-[#94A3B8]'
            )}
          >
            <span className="relative">
              <Icon className={cn('h-5 w-5', active && 'text-[#2563EB] dark:text-[#60A5FA]')} />
              {isAdmin && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-[#EF4444] text-white text-[9px] font-bold leading-none">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
