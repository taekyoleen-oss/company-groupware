'use client'
import { format, startOfDay, endOfDay, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Plus, Clock, MapPin } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { resolveEventColor } from '@/lib/utils/eventColor'
import type { EventWithDetails } from '@/types/app'

interface DayEventsPopupProps {
  isOpen: boolean
  onClose: () => void
  date: Date
  events: EventWithDetails[]
  onEventClick: (eventId: string) => void
  onNewEvent: () => void
}

function formatEventTime(event: EventWithDetails): string {
  if (event.is_all_day) return '하루 종일'
  const start = parseISO(event.start_at)
  const end = parseISO(event.end_at)
  return `${format(start, 'HH:mm')} ~ ${format(end, 'HH:mm')}`
}

export function DayEventsPopup({
  isOpen,
  onClose,
  date,
  events,
  onEventClick,
  onNewEvent,
}: DayEventsPopupProps) {
  const dateLabel = format(date, 'M월 d일 (EEE)', { locale: ko })

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-[#111827]">
            {dateLabel} 일정
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {events.map(event => {
            const color = resolveEventColor({
              color: event.color,
              category: event.category as any,
              author: event.author as any,
            })
            return (
              <button
                key={event.id}
                onClick={() => onEventClick(event.id)}
                className="w-full flex items-start gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2.5 text-left hover:bg-[#F9FAFB] transition-colors"
              >
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#111827]">{event.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-[#6B7280]">
                    <Clock className="h-3 w-3 shrink-0" />
                    {formatEventTime(event)}
                  </p>
                  {event.location && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[#6B7280]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <Button
          onClick={onNewEvent}
          className="w-full mt-1"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          새 일정 추가
        </Button>
      </DialogContent>
    </Dialog>
  )
}
