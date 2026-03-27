# 스킬: calendar-view

## 트리거 조건

캘린더 컴포넌트 구현, FullCalendar 설정, 뷰 전환 로직 작성 시 이 스킬을 참조한다.

---

## 라이브러리

```bash
npm install @fullcalendar/react @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

| 패키지 | 제공 기능 |
|--------|---------|
| `@fullcalendar/daygrid` | 월 뷰 (dayGridMonth) |
| `@fullcalendar/timegrid` | 주/일 뷰 (timeGridWeek, timeGridDay) |
| `@fullcalendar/interaction` | 클릭·드래그 이벤트 |

---

## 기본 설정

```tsx
// components/calendar/CalendarMain.tsx
'use client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'

interface CalendarMainProps {
  events: EventInput[]
  onDateClick: (date: Date) => void
  onEventClick: (eventId: string) => void
}

export function CalendarMain({ events, onDateClick, onEventClick }: CalendarMainProps) {
  const isMobile = useIsMobile() // window.innerWidth < 768

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      // 모바일 기본: 월 뷰 / PC 기본: 월 뷰 (동일)
      initialView="dayGridMonth"
      // 뷰 전환 버튼: 일/주/월
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: isMobile ? 'dayGridMonth' : 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      // 한국어 로케일
      locale="ko"
      // 주 시작: 일요일
      firstDay={0}
      // 빈 슬롯 클릭 → 일정 생성 모달 (날짜/시간 자동 입력)
      dateClick={(info: DateClickArg) => onDateClick(info.date)}
      selectable={true}
      select={(info) => onDateClick(info.start)}
      // 일정 클릭
      eventClick={(info: EventClickArg) => onEventClick(info.event.id)}
      // 이벤트 데이터
      events={events}
      // 이벤트 렌더링 커스터마이징
      eventContent={renderEventContent}
      // 높이 조정
      height={isMobile ? 'auto' : '80vh'}
    />
  )
}
```

---

## 이벤트 색상 렌더링

색상 우선순위: `.claude/skills/color-token/SKILL.md` 참조

```tsx
function renderEventContent(eventInfo: EventContentArg) {
  return (
    <div
      className="fc-event-custom"
      style={{ backgroundColor: eventInfo.event.backgroundColor, borderColor: eventInfo.event.borderColor }}
    >
      <span className="fc-event-title">{eventInfo.event.title}</span>
    </div>
  )
}
```

FullCalendar에 넘기는 `EventInput` 구성:
```tsx
const fcEvents: EventInput[] = events.map(event => ({
  id: event.id,
  title: event.title,
  start: event.start_at,
  end: event.end_at,
  allDay: event.is_all_day,
  backgroundColor: resolveEventColor(event), // color-token 스킬 사용
  borderColor: resolveEventColor(event),
  extendedProps: { visibility: event.visibility, createdBy: event.created_by },
}))
```

---

## 빈 슬롯 클릭 → EventModal 연동

```tsx
// app/(app)/calendar/page.tsx
const [modalDate, setModalDate] = useState<Date | null>(null)
const [isModalOpen, setIsModalOpen] = useState(false)

const handleDateClick = (date: Date) => {
  setModalDate(date)
  setIsModalOpen(true)
}

// EventModal에 초기 날짜 전달
<EventModal
  isOpen={isModalOpen}
  initialDate={modalDate}
  onClose={() => { setIsModalOpen(false); setModalDate(null) }}
/>
```

EventModal 내에서:
```tsx
// initialDate가 있으면 start_at, end_at에 자동 설정
const defaultStart = initialDate ?? new Date()
const defaultEnd = addHours(defaultStart, 1) // date-fns 사용
```

---

## 뷰 전환 버튼 (ViewToggle)

```tsx
// components/calendar/ViewToggle.tsx
// FullCalendar 내장 headerToolbar 대신 커스텀 버튼 원할 경우
const views = [
  { key: 'dayGridMonth', label: '월' },
  { key: 'timeGridWeek', label: '주' },
  { key: 'timeGridDay', label: '일' },
]

// calendarRef.current.getApi().changeView(viewKey) 로 뷰 전환
```

---

## TweakCN 스타일 오버라이드

```css
/* FullCalendar 기본 스타일 오버라이드 */
.fc .fc-button {
  background-color: var(--primary);
  border-color: var(--primary);
  border-radius: 0.5rem;
}
.fc .fc-button-active {
  background-color: #1d4ed8;
}
.fc .fc-toolbar-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}
.fc .fc-col-header-cell {
  background-color: var(--background);
}
.fc-event-custom {
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

## 참고

상세 FullCalendar API: `.claude/skills/calendar-view/references/fullcalendar-guide.md`
