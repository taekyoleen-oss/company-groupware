'use client'
import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  React.useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className={cn(
      'fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg',
      'md:bottom-6',
      { 'bg-[#10B981] text-white': type === 'success', 'bg-[#EF4444] text-white': type === 'error', 'bg-[#111827] text-white': type === 'info' }
    )}>
      <span>{message}</span>
      <button onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
  )
}

// Toast state hook
export function useToast() {
  const [toast, setToast] = React.useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null)

  const showToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
  }, [])

  const ToastComponent = toast ? (
    <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
  ) : null

  return { showToast, ToastComponent }
}
