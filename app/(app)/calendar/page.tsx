'use client'
import { useState, useCallback, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EventModal } from '@/components/calendar/EventModal'
import { resolveEventColor } from '@/lib/utils/eventColor'
import type { EventWithDetails } from '@/types/app'
import { useEffect } from 'react'

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null)
  const [events, setEvents] = useState<EventWithDetails[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalDate, setModalDate] = useState<Date | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    const res = await fetch('/api/events')
    if (res.ok) {
      const data: EventWithDetails[] = await res.json()
      setEvents(data)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const fcEvents: EventInput[] = events.map(e => ({
    id: e.id,
    title: e.title,
    start: e.start_at,
    end: e.end_at,
    allDay: e.is_all_day,
    backgroundColor: resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any }),
    borderColor: resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any }),
    textColor: '#ffffff',
  }))

  const handleDateClick = (info: DateClickArg) => {
    setModalDate(info.date)
    setEditEventId(null)
    setIsModalOpen(true)
  }

  const handleEventClick = (info: EventClickArg) => {
    setEditEventId(info.event.id)
    setModalDate(null)
    setIsModalOpen(true)
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#111827]">캘린더</h1>
        <Button size="sm" onClick={() => { setModalDate(new Date()); setEditEventId(null); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          새 일정
        </Button>
      </div>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          locale="ko"
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
