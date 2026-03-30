'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-9 w-9" />

  const options = [
    { value: 'light', icon: Sun, label: '라이트' },
    { value: 'dark', icon: Moon, label: '다크' },
    { value: 'system', icon: Monitor, label: '시스템' },
  ] as const

  const current = options.find(o => o.value === theme) ?? options[2]
  const Icon = current.icon

  const cycle = () => {
    const idx = options.findIndex(o => o.value === theme)
    setTheme(options[(idx + 1) % options.length].value)
  }

  return (
    <button
      onClick={cycle}
      title={`테마: ${current.label}`}
      className={cn(
        'h-9 w-9 flex items-center justify-center rounded-lg transition-colors',
        'text-[#6B7280] hover:text-[#111827] hover:bg-[#F9FAFB]',
        'dark:text-[#9CA3AF] dark:hover:text-[#F9FAFB] dark:hover:bg-[#374151]'
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
