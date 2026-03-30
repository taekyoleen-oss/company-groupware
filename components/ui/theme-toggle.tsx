'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-9 w-9" />

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn(
        'h-9 w-9 flex items-center justify-center rounded-lg transition-colors',
        'text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB]',
        'dark:text-[#9CA3AF] dark:hover:text-[#F9FAFB] dark:hover:bg-[#4B5563]'
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
