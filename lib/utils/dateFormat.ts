import { format, isToday, isTomorrow, isYesterday } from 'date-fns'
import { ko } from 'date-fns/locale'

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'yyyy.MM.dd (EEE)', { locale: ko })
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })
}

export function formatDateRange(startAt: string, endAt: string, isAllDay: boolean): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (isAllDay) return format(start, 'yyyy.MM.dd (EEE)', { locale: ko })
  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
  if (sameDay) {
    return `${format(start, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })} ~ ${format(end, 'HH:mm')}`
  }
  return `${format(start, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })} ~ ${format(end, 'yyyy.MM.dd HH:mm', { locale: ko })}`
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isToday(d)) return `오늘 ${format(d, 'HH:mm')}`
  if (isTomorrow(d)) return `내일 ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `어제 ${format(d, 'HH:mm')}`
  return formatDateTime(d)
}
