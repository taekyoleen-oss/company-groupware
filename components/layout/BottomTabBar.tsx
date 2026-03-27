'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, FileText, CheckSquare, User } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const TABS = [
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/notices', label: '공지', icon: FileText },
  { href: '/todo', label: 'TO-DO', icon: CheckSquare },
  { href: '/profile', label: '프로필', icon: User },
]

export function BottomTabBar() {
  const pathname = usePathname()
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E7EB] flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link key={href} href={href} className={cn('flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors', active ? 'text-[#2563EB]' : 'text-[#6B7280]')}>
            <Icon className={cn('h-5 w-5', active && 'text-[#2563EB]')} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
