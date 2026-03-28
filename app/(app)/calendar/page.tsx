'use client'
import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { startOfDay, endOfDay, parseISO } from 'date-fns'
import { Plus, X, Users, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventModal } from '@/components/calendar/EventModal'
import { DayEventsPopup } from '@/components/calendar/DayEventsPopup'
import { resolveEventColor } from '@/lib/utils/eventColor'
import type { EventWithDetails } from '@/types/app'

function CalendarContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const filterType     = searchParams.get('filter')   // 'team' | 'member' | null
  const filterUserId   = searchParams.get('userId')
  const filterUserName = searchParams.get('userName')
  const includeCompany = searchParams.get('includeCompany') !== 'false' // default true

  const calendarRef = useRef<FullCalendar>(null)
  const [events, setEvents]           = useState<EventWithDetails[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalDate, setModalDate]     = useState<Date | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)

  const [isDayPopupOpen, setIsDayPopupOpen] = useState(false)
  const [dayPopupDate,   setDayPopupDate]   = useState<Date>(new Date())
  const [dayPopupEvents, setDayPopupEvents] = useState<EventWithDetails[]>([])

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

  const fcEvents: EventInput[] = events.map(e => {
    const prefix = e.visibility === 'company' ? '[전사] ' : e.visibility === 'team' ? '[팀] ' : ''
    return {
      id:              e.id,
      title:           prefix + e.title,
      start:           e.start_at,
      end:             e.end_at,
      allDay:          e.is_all_day,
      backgroundColor: resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any }),
      borderColor:     resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any }),
      textColor:       '#ffffff',
    }
  })

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
    const clickedDate  = info.date
    const eventsOnDay  = getEventsOnDate(clickedDate)
    if (eventsOnDay.length > 0) {
      setDayPopupDate(clickedDate)
      setDayPopupEvents(eventsOnDay)
      setIsDayPopupOpen(true)
    } else {
      setModalDate(clickedDate)
      setEditEventId(null)
      setIsModalOpen(true)
    }
  }

  const handleEventClick = (info: EventClickArg) => {
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

  const clearFilter = () => router.push('/calendar')

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#111827]">캘린더</h1>
        <Button size="sm" onClick={() => { setModalDate(new Date()); setEditEventId(null); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          새 일정
        </Button>
      </div>

      {/* Active filter badge */}
      {filterType && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded-full px-3 py-1 font-medium">
            {filterType === 'team' ? (
              <><Users className="h-3 w-3" /> 팀 일정만 보기</>
            ) : (
              <><User className="h-3 w-3" /> {filterUserName ?? '멤버'} 일정 보기</>
            )}
          </span>
          <button
            onClick={clearFilter}
            className="inline-flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            <X className="h-3 w-3" /> 필터 해제
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E5E7EB] p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          locale="ko"
          timeZone="local"
          firstDay={0}
          events={fcEvents}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          selectable={true}
          select={(info) => handleDateClick({ date: info.start } as DateClickArg)}
          height="auto"
          dayMaxEvents={3}
          buttonText={{ today: '오늘', month: '월', week: '주', day: '일' }}
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
