import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function formatDateRange(startAt: string, endAt: string, isAllDay: boolean): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (isAllDay) return format(start, 'yyyy.MM.dd (EEE)', { locale: ko })
  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
  if (sameDay) {
    return `${format(start, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })} ~ ${format(end, 'HH:mm')}`
  }
  return `${format(start, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })} ~ ${format(end, 'yyyy.MM.dd HH:mm', { locale: ko })}`
}

export function formatEventShare(event: {
  id: string; title: string; start_at: string; end_at: string;
  is_all_day: boolean; location?: string | null;
  category?: { name: string } | null; author: { full_name: string }
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const lines = [
    `📅 [${event.category?.name ?? '일정'}] ${event.title}`,
    `⏰ ${formatDateRange(event.start_at, event.end_at, event.is_all_day)}`,
    event.location ? `📍 ${event.location}` : null,
    `👤 ${event.author.full_name}`,
    `🔗 ${appUrl}/calendar/${event.id}`,
  ].filter(Boolean)
  return lines.join('\n')
}

export function formatNoticeShare(notice: {
  id: string; title: string; content: string; author: { full_name: string }
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const summary = stripHtml(notice.content).slice(0, 100)
  return [
    `📢 ${notice.title}`,
    `✏️ ${summary}${summary.length >= 100 ? '...' : ''}`,
    `👤 ${notice.author.full_name}`,
    `🔗 ${appUrl}/notices/${notice.id}`,
  ].join('\n')
}
