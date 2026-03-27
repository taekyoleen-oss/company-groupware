import * as React from 'react'
import { cn } from '@/lib/utils/cn'

interface UserAvatarProps {
  name: string
  color: string
  size?: number
  className?: string
}

export function UserAvatar({ name, color, size = 32, className }: UserAvatarProps) {
  const initials = name
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className={cn('flex items-center justify-center rounded-full text-white font-semibold shrink-0', className)}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  )
}
