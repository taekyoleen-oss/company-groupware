'use client'
import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput, EventDropArg } from '@fullcalendar/core'
import { startOfDay, endOfDay, parseISO } from 'date-fns'
import { Plus, X, Users, User, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { EventModal } from '@/components/calendar/EventModal'
import { VacationModal, type VacationPrefill } from '@/components/calendar/VacationModal'
import { DayEventsPopup } from '@/components/calendar/DayEventsPopup'
import { resolveEventColor } from '@/lib/utils/eventColor'
import {
  buildHolidays,
  isHolidayRegion,
  HOLIDAY_REGION_OPTIONS,
  DEFAULT_HOLIDAY_REGION,
  type HolidayRegion,
} from '@/lib/utils/holidays'
import type { EventWithDetails } from '@/types/app'
import { useProfile, useTeams } from '@/lib/hooks/use-shared-data'

const HOLIDAY_REGION_STORAGE_KEY = 'cg.holidayRegion'

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

  const [isVacationModalOpen, setIsVacationModalOpen] = useState(false)
  const [vacationModalDate, setVacationModalDate]     = useState<Date | null>(null)
  const [vacationEventId, setVacationEventId]         = useState<string | null>(null)
  const [vacationPrefill, setVacationPrefill]         = useState<VacationPrefill | null>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdminUser,   setIsAdminUser]   = useState(false)
  const [proxyUserId,   setProxyUserId]   = useState<string | null>(null)
  const [pendingCancelIds, setPendingCancelIds] = useState<Set<string>>(new Set())

  const [currentView, setCurrentView] = useState('dayGridMonth')
  const [holidayRegion, setHolidayRegion] = useState<HolidayRegion>(DEFAULT_HOLIDAY_REGION)
  const [teamsMap, setTeamsMap] = useState<Record<string, { name: string; abbreviation: string | null }>>({})

  const clickTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastClickDateRef = useRef<string | null>(null)
  const touchStartX      = useRef<number>(0)
  const touchStartY      = useRef<number>(0)

  // Track whether we pushed a history entry for the current modal
  const modalHistoryPushed = useRef(false)
  const skipPopstate       = useRef(false)

  // Back-button: push state when any modal/popup opens, pop on back
  useEffect(() => {
    const anyOpen = isModalOpen || isDayPopupOpen || isVacationModalOpen
    if (anyOpen && !modalHistoryPushed.current) {
      window.history.pushState({ cgModal: true }, '')
      modalHistoryPushed.current = true
    }
  }, [isModalOpen, isDayPopupOpen, isVacationModalOpen])

  useEffect(() => {
    const handlePopState = () => {
      if (skipPopstate.current) {
        skipPopstate.current = false
        return
      }
      modalHistoryPushed.current = false
      setIsModalOpen(false)
      setModalDate(null)
      setEditEventId(null)
      setIsDayPopupOpen(false)
      setIsVacationModalOpen(false)
      setVacationModalDate(null)
      setVacationEventId(null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Wrap close callbacks to also clean up history state
  const closeEventModal = useCallback(() => {
    if (modalHistoryPushed.current) {
      skipPopstate.current = true
      modalHistoryPushed.current = false
      window.history.back()
    }
    setIsModalOpen(false)
    setModalDate(null)
    setEditEventId(null)
  }, [])

  const closeDayPopup = useCallback(() => {
    if (modalHistoryPushed.current) {
      skipPopstate.current = true
      modalHistoryPushed.current = false
      window.history.back()
    }
    setIsDayPopupOpen(false)
  }, [])

  const closeVacationModal = useCallback(() => {
    if (modalHistoryPushed.current) {
      skipPopstate.current = true
      modalHistoryPushed.current = false
      window.history.back()
    }
    setIsVacationModalOpen(false)
    setVacationModalDate(null)
    setVacationEventId(null)
    setVacationPrefill(null)
  }, [])

  // 일반 일정 모달 → 휴가 신청 모달로 전환 (입력값 이관)
  // 두 모달 모두 anyOpen=true 이므로 히스토리 스택을 건드리지 않고 상태만 교체한다
  const handleConvertToVacation = useCallback((data: VacationPrefill) => {
    setIsModalOpen(false)
    setModalDate(null)
    setEditEventId(null)
    setVacationPrefill(data)
    setVacationModalDate(data.startDate ? new Date(data.startDate + 'T00:00') : new Date())
    setVacationEventId(null)
    setIsVacationModalOpen(true)
  }, [])

  // SWR — /api/profiles, /api/admin/teams 가 여러 컴포넌트에서 호출되어도 30s dedupe
  const { data: profileSwr } = useProfile()
  const { data: teamsSwr } = useTeams()

  useEffect(() => {
    if (!profileSwr) return
    const p: any = profileSwr
    setCurrentUserId(p?.id ?? null)
    // 앱관리자: is_super_admin=true. role='admin' fallback도 허용 (마이그레이션 전 안전)
    setIsAdminUser(p?.is_super_admin === true || (p?.is_super_admin == null && p?.role === 'admin'))
  }, [profileSwr])

  // 공휴일 표시 국가: 브라우저(PC)에 저장 → 각자 변경 전까지 유지
  // SSR/CSR hydration 일치를 위해 초기값은 기본값, 마운트 후 localStorage 적용
  useEffect(() => {
    const saved = localStorage.getItem(HOLIDAY_REGION_STORAGE_KEY)
    if (isHolidayRegion(saved)) setHolidayRegion(saved)
  }, [])

  // 선택한 국가/지역의 공휴일 (순수 계산 → useMemo)
  const { events: holidayEvents, dateSet: holidayDateSet } = useMemo(
    () => buildHolidays(holidayRegion),
    [holidayRegion],
  )

  // 콤보박스 변경 → 즉시 반영 + 브라우저에 저장(각자 변경 전까지 유지)
  const handleHolidayRegionChange = useCallback((region: HolidayRegion) => {
    setHolidayRegion(region)
    try { localStorage.setItem(HOLIDAY_REGION_STORAGE_KEY, region) } catch { /* 저장 실패해도 화면 표시는 유지 */ }
  }, [])

  useEffect(() => {
    if (!Array.isArray(teamsSwr)) return
    const map: Record<string, { name: string; abbreviation: string | null }> = {}
    ;(teamsSwr as Array<{ id: string; name: string; abbreviation: string | null }>).forEach(t => {
      map[t.id] = { name: t.name, abbreviation: t.abbreviation }
    })
    setTeamsMap(map)
  }, [teamsSwr])

  // 현재 보이는 달력 범위(±1개월 여유). datesSet 이 채운다.
  // 이전에는 start/end 없이 전 기간 이벤트를 무제한 조회해 이벤트가 쌓일수록 Disk IO 가 커졌다.
  const rangeRef = useRef<{ start: string; end: string } | null>(null)

  const fetchEvents = useCallback(async () => {
    // 보이는 범위가 아직 정해지지 않았으면(datesSet 이전) 전체 조회를 피하기 위해 대기.
    if (!rangeRef.current) return
    const params = new URLSearchParams()
    if (filterType === 'team') {
      params.set('team_only', 'true')
    } else if (filterType === 'member' && filterUserId) {
      params.set('created_by', filterUserId)
    }
    if (!includeCompany) params.set('include_company', 'false')
    params.set('start', rangeRef.current.start)
    params.set('end', rangeRef.current.end)
    const res = await fetch(`/api/events?${params.toString()}`)
    if (res.ok) {
      const data: EventWithDetails[] = await res.json()
      setEvents(data)
    }
  }, [filterType, filterUserId, includeCompany])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const fetchPendingCancels = useCallback(async () => {
    const res = await fetch('/api/vacation-cancel-requests')
    if (res.ok) {
      const data: { event_id: string }[] = await res.json()
      setPendingCancelIds(new Set(data.map(r => r.event_id)))
    }
  }, [])

  useEffect(() => { fetchPendingCancels() }, [fetchPendingCancels])

  // 휴가 취소 승인/거부 메시지 수신 시 캘린더 자동 새로고침
  useEffect(() => {
    if (!currentUserId) return
    const supabase = createClient()
    const channel = supabase
      .channel('calendar-vacation-refresh')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cg_messages' }, (payload) => {
        const msg = payload.new as any
        if (msg.recipient_id !== currentUserId || typeof msg.content !== 'string') return
        if (msg.content.startsWith('[휴가 취소 승인]')) {
          fetchEvents()
          fetchPendingCancels()
        } else if (msg.content.startsWith('[휴가 취소 거부]')) {
          fetchPendingCancels()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId, fetchEvents, fetchPendingCancels])

  // 휴가 대리 게시자(앱관리자 지정 1명)는 잘못 게시된 일정 정정을 위해 타인 일정도 수정 가능
  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => setProxyUserId(d?.vacation_proxy_user_id ?? null))
      .catch(() => setProxyUserId(null))
  }, [])

  const canEditEvent = (e: EventWithDetails) =>
    isAdminUser || e.created_by === currentUserId ||
    (!!currentUserId && proxyUserId === currentUserId)

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
    ...holidayEvents,
    ...events.map(e => {
      const isVac = e.is_vacation
      const isHalf = isVac && !e.is_all_day
      const isMorning = isHalf && new Date(e.start_at).getHours() < 12
      const prefix = isVac
        ? ''
        : e.visibility === 'company' ? '[전사] ' : e.visibility === 'team' ? `[${getTeamAbbr(e.team_id)}] ` : ''
      const isCancelPending = isVac && pendingCancelIds.has(e.id)
      const title = isVac
        ? `☀️ ${e.title}${isCancelPending ? ' 취소중' : ''}`
        : prefix + e.title

      let endDate = e.end_at
      if (e.is_all_day) {
        const d = new Date(e.end_at)
        endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
      }

      const baseColor = resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any })

      // 휴가 배경색 — 오전휴가: 파스텔 파랑 / 오후휴가: 파스텔 노랑 / 종일휴가: 옅은 빨강(반차보다 짙게)
      const vacBg     = isHalf ? (isMorning ? '#EFF6FF' : '#FEFCE8') : '#FECACA'
      const vacBorder = isHalf ? (isMorning ? '#BFDBFE' : '#FEF08A') : '#EF4444'
      const vacText   = isHalf ? (isMorning ? '#1E40AF' : '#854D0E') : '#991B1B'

      return {
        id:              e.id,
        title,
        start:           e.start_at,
        end:             endDate,
        allDay:          e.is_all_day,
        backgroundColor: isVac ? vacBg : baseColor,
        borderColor:     isVac ? vacBorder : baseColor,
        textColor:       isVac ? vacText : '#ffffff',
        editable:        !e.is_vacation && canEditEvent(e),
        classNames:      isVac ? ['fc-vacation-event'] : [],
        // 반일휴가: 월 뷰에서 점 표시 대신 배경색 블록으로 렌더링
        ...(isHalf ? { display: 'block' } : {}),
        extendedProps:   { vacHalf: isHalf },
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

  const openEventOrVacation = (eventId: string) => {
    const ev = events.find(e => e.id === eventId)
    if (ev?.is_vacation) {
      setVacationEventId(eventId)
      setVacationModalDate(null)
      setIsVacationModalOpen(true)
    } else {
      setEditEventId(eventId)
      setModalDate(null)
      setIsModalOpen(true)
    }
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
    if (info.event.id.startsWith('holiday-')) return
    openEventOrVacation(info.event.id)
  }

  const handleDayPopupEventClick = (eventId: string) => {
    setIsDayPopupOpen(false)
    openEventOrVacation(eventId)
  }

  const handleDayPopupNewEvent = () => {
    setIsDayPopupOpen(false)
    setModalDate(dayPopupDate)
    setEditEventId(null)
    setIsModalOpen(true)
  }

  const handleEventDrop = async (info: EventDropArg) => {
    const { event, revert } = info
    if (event.id.startsWith('holiday-')) { revert(); return }
    const eventData = events.find(e => e.id === event.id)
    if (eventData?.is_vacation) { revert(); return }
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
          {/* 공휴일 표시 국가 선택 (회원별 유지) */}
          <label className="sr-only" htmlFor="holiday-region">공휴일 국가</label>
          <select
            id="holiday-region"
            value={holidayRegion}
            onChange={(e) => handleHolidayRegionChange(e.target.value as HolidayRegion)}
            className="rounded-full border border-[#D1D5DB] bg-white px-2.5 py-1 text-xs font-medium text-[#374151] transition-colors hover:border-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 dark:border-[#4B5563] dark:bg-[#1F2937] dark:text-[#E5E7EB]"
            title="캘린더에 표시할 공휴일 국가를 선택하세요"
          >
            {HOLIDAY_REGION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {/* 휴가 신청 버튼 */}
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
            onClick={() => {
              setVacationModalDate(new Date())
              setVacationEventId(null)
              setVacationPrefill(null)
              setIsVacationModalOpen(true)
            }}
          >
            <Sun className="h-4 w-4 mr-1" />
            휴가
          </Button>
          {/* 새 일정 버튼 */}
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
          datesSet={(arg) => {
            setCurrentView(arg.view.type)
            // 보이는 범위 ±1개월만 조회 (긴 다일 일정·월 경계 안전 여유)
            const PAD = 31 * 24 * 60 * 60 * 1000
            const start = new Date(arg.start.getTime() - PAD).toISOString()
            const end   = new Date(arg.end.getTime() + PAD).toISOString()
            const prev = rangeRef.current
            if (!prev || prev.start !== start || prev.end !== end) {
              rangeRef.current = { start, end }
              fetchEvents()
            }
          }}
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
          eventContent={(arg: any) => {
            // 반일휴가(오전/오후휴가)는 시간이 제목에 내포되어 있어 시간 표기를 생략
            if (arg.event.extendedProps?.vacHalf) {
              return (
                <div className="fc-event-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                  {arg.event.title}
                </div>
              )
            }
            return true
          }}
          dayCellClassNames={(arg) => {
            // 공휴일은 요일(특히 토요일) 색상을 덮어쓰고 빨간색으로 표시.
            // .fc-day.cg-holiday CSS 규칙(globals.css)이 !important로 날짜 숫자를 빨간색 처리.
            // 콤보박스로 국가를 바꾸면 holidayDateSet 이 갱신되어 자동 재적용된다.
            const dateStr = arg.date.toLocaleDateString('sv-SE')
            return holidayDateSet.has(dateStr) ? ['cg-holiday'] : []
          }}
        />
      </div>

      <DayEventsPopup
        isOpen={isDayPopupOpen}
        onClose={closeDayPopup}
        date={dayPopupDate}
        events={dayPopupEvents}
        onEventClick={handleDayPopupEventClick}
        onNewEvent={handleDayPopupNewEvent}
      />

      <EventModal
        isOpen={isModalOpen}
        onClose={closeEventModal}
        initialDate={modalDate}
        eventId={editEventId}
        onSuccess={fetchEvents}
        onConvertToVacation={handleConvertToVacation}
      />

      <VacationModal
        isOpen={isVacationModalOpen}
        onClose={closeVacationModal}
        initialDate={vacationModalDate}
        eventId={vacationEventId}
        prefill={vacationPrefill}
        onSuccess={() => { fetchEvents(); fetchPendingCancels() }}
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
