import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-[#4B5563] dark:bg-[#374151] dark:text-[#F1F5F9] dark:placeholder:text-[#94A3B8] dark:focus:ring-[#60A5FA]',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
