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
          'bg-[#EFF6FF] text-[#2563EB]': variant === 'default',
          'border border-current': variant === 'outline',
          'bg-amber-50 text-[#F59E0B] border border-amber-200': variant === 'warning',
          'bg-green-50 text-[#10B981] border border-green-200': variant === 'success',
          'bg-red-50 text-[#EF4444] border border-red-200': variant === 'danger',
        },
        className
      )}
      {...props}
    />
  )
}
