import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils/cn'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'danger' | 'secondary'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-[#2563EB] text-white hover:bg-[#1d4ed8] focus-visible:ring-[#2563EB] dark:bg-[#3B82F6] dark:hover:bg-[#2563EB]': variant === 'default',
            'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB] dark:border-[#374151] dark:bg-[#1F2937] dark:text-[#F9FAFB] dark:hover:bg-[#374151]': variant === 'outline',
            'bg-transparent text-[#111827] hover:bg-[#F9FAFB] dark:text-[#F9FAFB] dark:hover:bg-[#374151]': variant === 'ghost',
            'bg-[#EF4444] text-white hover:bg-[#dc2626] dark:bg-[#DC2626] dark:hover:bg-[#B91C1C]': variant === 'danger',
            'bg-[#F9FAFB] text-[#111827] hover:bg-[#E5E7EB] dark:bg-[#374151] dark:text-[#F9FAFB] dark:hover:bg-[#4B5563]': variant === 'secondary',
          },
          {
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-11 px-6 text-base': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
