'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Pin } from 'lucide-react'
import { formatDateRange } from '@/lib/utils/dateFormat'
import { resolveEventColor } from '@/lib/utils/eventColor'
import type { EventWithDetails, Notice } from '@/types/app'

export function Sidebar() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithDetails[]>([])
  const [recentNotices, setRecentNotices] = useState<Notice[]>([])

  useEffect(() => {
    fetch('/api/events?start=' + new Date().toISOString())
      .then(r => r.json())
      .then((data: EventWithDetails[]) => {
        const pub = data.filter(e => e.visibility !== 'private').slice(0, 3)
        setUpcomingEvents(pub)
      })
      .catch(() => {})

    fetch('/api/notices')
      .then(r => r.json())
      .then((data: any) => {
        const list: Notice[] = data.items ?? []
        setRecentNotices(list.slice(0, 5))
      })
      .catch(() => {})
  }, [])

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startPad = getDay(startOfMonth(currentMonth))

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white border-r border-[#E5E7EB] p-4 gap-6 overflow-y-auto">
      {/* Recent Notices */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">최근 공지</h3>
          <Link href="/notices" className="text-[10px] text-[#2563EB] hover:underline">더보기</Link>
        </div>
        {recentNotices.length === 0 ? (
          <p className="text-xs text-[#6B7280]">공지사항이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentNotices.map(notice => (
              <li key={notice.id}>
                <Link href={`/notices/${notice.id}`} className="flex items-start gap-1.5 hover:bg-[#F9FAFB] rounded-lg p-1.5 -mx-1.5 transition-colors group">
                  {notice.is_pinned && <Pin className="h-3 w-3 text-[#2563EB] mt-0.5 shrink-0" />}
                  <p className="text-xs text-[#111827] truncate group-hover:text-[#2563EB] transition-colors">{notice.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mini Calendar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1))} className="p-1 hover:bg-[#F9FAFB] rounded">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{format(currentMonth, 'yyyy년 M월', { locale: ko })}</span>
          <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1))} className="p-1 hover:bg-[#F9FAFB] rounded">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0 text-center">
          {['일','월','화','수','목','금','토'].map(d => (
            <div key={d} className="text-[10px] text-[#6B7280] py-1">{d}</div>
          ))}
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map(day => (
            <button
              key={day.toISOString()}
              onClick={() => {}}
              className={`text-xs py-1 rounded-full mx-auto w-6 h-6 flex items-center justify-center transition-colors ${
                isToday(day) ? 'bg-[#2563EB] text-white' : 'hover:bg-[#F9FAFB] text-[#111827]'
              } ${!isSameMonth(day, currentMonth) ? 'text-[#9CA3AF]' : ''}`}
            >
              {format(day, 'd')}
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming Events */}
      <div>
        <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2">다가오는 일정</h3>
        {upcomingEvents.length === 0 ? (
          <p className="text-xs text-[#6B7280]">예정된 일정이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingEvents.map(event => (
              <li key={event.id}>
                <Link href={`/calendar/${event.id}`} className="flex items-start gap-2 hover:bg-[#F9FAFB] rounded-lg p-1.5 -mx-1.5 transition-colors">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: resolveEventColor({ color: event.color, category: event.category as any, author: event.author as any }) }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#111827] truncate">{event.title}</p>
                    <p className="text-[10px] text-[#6B7280]">{formatDateRange(event.start_at, event.end_at, event.is_all_day)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
