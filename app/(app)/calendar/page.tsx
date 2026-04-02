'use client'
import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput, EventDropArg } from '@fullcalendar/core'
import { startOfDay, endOfDay, parseISO } from 'date-fns'
import { Plus, X, Users, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventModal } from '@/components/calendar/EventModal'
import { DayEventsPopup } from '@/components/calendar/DayEventsPopup'
import { resolveEventColor } from '@/lib/utils/eventColor'
import { KOREAN_HOLIDAYS, KOREAN_ANNIVERSARIES, HOLIDAY_DATE_SET } from '@/lib/utils/koreanHolidays'
import type { EventWithDetails } from '@/types/app'

function CalendarContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const filterType     = searchParams.get('filter')
  const filterUserId   = searchParams.get('userId')
  const filterUserName = searchParams.get('userName')
  const includeCompany = searchParams.get('includeCompany') !== 'false'

  const calendarRef = useRef<FullCalendar>(null)
  const [events, setEvents]           = useState<EventWithDetails[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalDate, setModalDate]     = useState<Date | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)

  const [isDayPopupOpen, setIsDayPopupOpen] = useState(false)
  const [dayPopupDate,   setDayPopupDate]   = useState<Date>(new Date())
  const [dayPopupEvents, setDayPopupEvents] = useState<EventWithDetails[]>([])

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdminUser,   setIsAdminUser]   = useState(false)

  const [currentView, setCurrentView] = useState('dayGridMonth')
  const [showAnniversaries, setShowAnniversaries] = useState(true)
  const [teamsMap, setTeamsMap] = useState<Record<string, { name: string; abbreviation: string | null }>>({})

  const clickTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickDateRef = useRef<string | null>(null)
  const touchStartX      = useRef<number>(0)
  const touchStartY      = useRef<number>(0)

  useEffect(() => {
    fetch('/api/profiles')
      .then(r => r.json())
      .then((p: any) => {
        setCurrentUserId(p?.id ?? null)
        setIsAdminUser(p?.role === 'admin')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/admin/teams')
      .then(r => r.json())
      .then((ts: Array<{ id: string; name: string; abbreviation: string | null }>) => {
        if (!Array.isArray(ts)) return
        const map: Record<string, { name: string; abbreviation: string | null }> = {}
        ts.forEach(t => { map[t.id] = { name: t.name, abbreviation: t.abbreviation } })
        setTeamsMap(map)
      })
      .catch(() => {})
  }, [])

  const fetchEvents = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterType === 'team') {
      params.set('team_only', 'true')
    } else if (filterType === 'member' && filterUserId) {
      params.set('created_by', filterUserId)
    }
    if (!includeCompany) params.set('include_company', 'false')
    const query = params.toString()
    const res = await fetch(`/api/events${query ? '?' + query : ''}`)
    if (res.ok) {
      const data: EventWithDetails[] = await res.json()
      setEvents(data)
    }
  }, [filterType, filterUserId, includeCompany])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const canEditEvent = (e: EventWithDetails) =>
    isAdminUser || e.created_by === currentUserId

  const getTeamAbbr = (teamId: string | null): string => {
    if (!teamId) return '팀'
    const t = teamsMap[teamId]
    if (!t) return '팀'
    return t.abbreviation?.trim() || t.name.slice(0, 2)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    if (dx < 0) api.next()
    else api.prev()
  }

  const fcEvents: EventInput[] = [
    ...KOREAN_HOLIDAYS,
    ...(showAnniversaries ? KOREAN_ANNIVERSARIES : []),
    ...events.map(e => {
      const prefix = e.visibility === 'company' ? '[전사] ' : e.visibility === 'team' ? `[${getTeamAbbr(e.team_id)}] ` : ''
      return {
        id:              e.id,
        title:           prefix + e.title,
        start:           e.start_at,
        end:             e.end_at,
        allDay:          e.is_all_day,
        backgroundColor: resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any }),
        borderColor:     resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any }),
        textColor:       '#ffffff',
        editable:        canEditEvent(e),
      }
    }),
  ]

  const getEventsOnDate = (date: Date): EventWithDetails[] => {
    const dayStart = startOfDay(date)
    const dayEnd   = endOfDay(date)
    return events.filter(e => {
      const eventStart = parseISO(e.start_at)
      const eventEnd   = parseISO(e.end_at)
      return eventStart <= dayEnd && eventEnd >= dayStart
    })
  }

  const handleDateClick = (info: DateClickArg) => {
    const clickedDate    = info.date
    const clickedDateStr = info.dateStr

    if (clickTimerRef.current && lastClickDateRef.current === clickedDateStr) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current    = null
      lastClickDateRef.current = null
      setIsDayPopupOpen(false)
      setModalDate(clickedDate)
      setEditEventId(null)
      setIsModalOpen(true)
    } else {
      lastClickDateRef.current = clickedDateStr
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current    = null
        lastClickDateRef.current = null
        const eventsOnDay = getEventsOnDate(clickedDate)
        if (eventsOnDay.length > 0) {
          setDayPopupDate(clickedDate)
          setDayPopupEvents(eventsOnDay)
          setIsDayPopupOpen(true)
        }
      }, 250)
    }
  }

  const handleEventClick = (info: EventClickArg) => {
    // 공휴일·기념일은 클릭 무시
    if (info.event.id.startsWith('holiday-') || info.event.id.startsWith('anniversary-')) return
    setEditEventId(info.event.id)
    setModalDate(null)
    setIsModalOpen(true)
  }

  const handleDayPopupEventClick = (eventId: string) => {
    setIsDayPopupOpen(false)
    setEditEventId(eventId)
    setModalDate(null)
    setIsModalOpen(true)
  }

  const handleDayPopupNewEvent = () => {
    setIsDayPopupOpen(false)
    setModalDate(dayPopupDate)
    setEditEventId(null)
    setIsModalOpen(true)
  }

  const handleEventDrop = async (info: EventDropArg) => {
    const { event, revert } = info
    // 드래그는 editable:false 이벤트에서 이미 막히지만, 안전망으로도 검사
    if (event.id.startsWith('holiday-') || event.id.startsWith('anniversary-')) { revert(); return }
    const start = event.start
    const end   = event.end ?? (start ? new Date(start.getTime() + 3600000) : null)
    if (!start) { revert(); return }
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_at: start.toISOString(),
        end_at:   end!.toISOString(),
      }),
    })
    if (!res.ok) {
      revert()
    } else {
      fetchEvents()
    }
  }

  const clearFilter = () => router.push('/calendar')

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9]">캘린더</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 기념일 표시 토글 */}
          <button
            type="button"
            onClick={() => setShowAnniversaries(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors select-none ${
              showAnniversaries
                ? 'border-[#D1D5DB] bg-[#F3F4F6] text-[#6B7280] dark:border-[#4B5563] dark:bg-[#374151] dark:text-[#9CA3AF]'
                : 'border-[#E5E7EB] bg-white text-[#9CA3AF] dark:border-[#374151] dark:bg-[#1F2937] dark:text-[#6B7280]'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${showAnniversaries ? 'bg-[#9CA3AF]' : 'bg-[#D1D5DB]'}`} />
            기념일
          </button>
          <Button size="sm" onClick={() => { setModalDate(new Date()); setEditEventId(null); setIsModalOpen(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            새 일정
          </Button>
        </div>
      </div>

      {filterType && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-full px-3 py-1 font-medium dark:bg-[#1E3A5F] dark:text-[#93C5FD] dark:border-[#2563EB]">
            {filterType === 'team' ? (
              <><Users className="h-3 w-3" /> 팀 일정만 보기</>
            ) : (
              <><User className="h-3 w-3" /> {filterUserName ?? '멤버'} 일정 보기</>
            )}
          </span>
          <button
            onClick={clearFilter}
            className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#111827] transition-colors dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]"
          >
            <X className="h-3 w-3" /> 필터 해제
          </button>
        </div>
      )}

      <div
        className="bg-white rounded-xl border border-[#E5E7EB] p-3 dark:bg-[#374151] dark:border-[#4B5563]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay,next7',
          }}
          customButtons={{
            next7: {
              text: '+7',
              click: () => {
                const api = calendarRef.current?.getApi()
                if (api) {
                  api.today()
                  api.changeView('timeGridNext7')
                }
              },
            },
          }}
          views={{
            timeGridNext7: {
              type: 'timeGrid',
              duration: { days: 7 },
            },
          }}
          datesSet={(arg) => setCurrentView(arg.view.type)}
          locale="ko"
          timeZone="local"
          firstDay={0}
          events={fcEvents}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          editable={true}
          eventDrop={handleEventDrop}
          selectable={false}
          scrollTime="09:00:00"
          scrollTimeReset={true}
          height={currentView.startsWith('timeGrid') ? 700 : 'auto'}
          dayMaxEvents={3}
          buttonText={{ today: '오늘', month: '월', week: '주', day: '일' }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          dayCellDidMount={(arg) => {
            const dateStr = arg.date.toLocaleDateString('sv-SE') // YYYY-MM-DD
            const isSunday  = arg.date.getDay() === 0
            const isHoliday = HOLIDAY_DATE_SET.has(dateStr)
            if (isSunday || isHoliday) {
              const dayNum = arg.el.querySelector('.fc-daygrid-day-number, .fc-col-header-cell-cushion')
              if (dayNum) (dayNum as HTMLElement).style.color = '#DC2626'
            }
          }}
        />
      </div>

      <DayEventsPopup
        isOpen={isDayPopupOpen}
        onClose={() => setIsDayPopupOpen(false)}
        date={dayPopupDate}
        events={dayPopupEvents}
        onEventClick={handleDayPopupEventClick}
        onNewEvent={handleDayPopupNewEvent}
      />

      <EventModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalDate(null); setEditEventId(null) }}
        initialDate={modalDate}
        eventId={editEventId}
        onSuccess={fetchEvents}
      />
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-[#6B7280]">로딩 중...</div>}>
      <CalendarContent />
    </Suspense>
  )
}
