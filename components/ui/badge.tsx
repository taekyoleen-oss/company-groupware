import * as React from 'react'
import { cn } from '@/lib/utils/cn'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'warning' | 'success' | 'danger'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-[#EFF6FF] text-[#2563EB] dark:bg-[#1E3A5F] dark:text-[#93C5FD]': variant === 'default',
          'border border-current': variant === 'outline',
          'bg-amber-50 text-[#F59E0B] border border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800': variant === 'warning',
          'bg-green-50 text-[#10B981] border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800': variant === 'success',
          'bg-red-50 text-[#EF4444] border border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800': variant === 'danger',
        },
        className
      )}
      {...props}
    />
  )
}
