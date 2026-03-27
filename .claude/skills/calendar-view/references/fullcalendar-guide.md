# FullCalendar 참고 가이드

## 주요 Props 레퍼런스

| Prop | 타입 | 설명 |
|------|------|------|
| `initialView` | string | 초기 뷰. `'dayGridMonth'` \| `'timeGridWeek'` \| `'timeGridDay'` |
| `events` | EventInput[] | 이벤트 배열 또는 함수 |
| `dateClick` | function | 날짜 셀 클릭 시 (interactionPlugin 필요) |
| `eventClick` | function | 이벤트 블록 클릭 시 |
| `select` | function | 날짜 범위 드래그 선택 시 |
| `selectable` | boolean | 날짜 범위 선택 활성화 |
| `editable` | boolean | 이벤트 드래그 편집 활성화 |
| `locale` | string | `'ko'` (한국어) |
| `firstDay` | number | 주 시작 요일. `0`=일요일 |
| `eventContent` | function | 이벤트 커스텀 렌더링 |
| `headerToolbar` | object | 헤더 버튼 배치 |
| `height` | string \| number | 캘린더 높이 |

## EventInput 타입

```typescript
interface EventInput {
  id?: string
  title: string
  start: string | Date
  end?: string | Date
  allDay?: boolean
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  extendedProps?: Record<string, any>
}
```

## CalendarApi 메서드 (ref 사용 시)

```typescript
const calendarRef = useRef<FullCalendar>(null)
const api = calendarRef.current?.getApi()

api?.changeView('timeGridWeek')  // 뷰 변경
api?.today()                      // 오늘로 이동
api?.prev()                       // 이전 기간
api?.next()                       // 다음 기간
api?.getDate()                    // 현재 표시 날짜
api?.addEvent(eventInput)         // 이벤트 추가 (Realtime 업데이트 시)
api?.getEventById(id)?.remove()   // 이벤트 삭제
```

## Realtime 연동 패턴

```typescript
// Supabase Realtime 이벤트 수신 시 FullCalendar API로 반영
useEffect(() => {
  const channel = supabase
    .channel('cg_events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cg_events' },
      (payload) => {
        const api = calendarRef.current?.getApi()
        if (payload.eventType === 'INSERT') {
          api?.addEvent(mapToFcEvent(payload.new))
        } else if (payload.eventType === 'DELETE') {
          api?.getEventById(payload.old.id)?.remove()
        } else if (payload.eventType === 'UPDATE') {
          const event = api?.getEventById(payload.new.id)
          event?.setProp('title', payload.new.title)
          event?.setStart(payload.new.start_at)
          event?.setEnd(payload.new.end_at)
        }
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [])
```

## 모바일 대응

- `height: 'auto'` 또는 `aspectRatio: 1.35`로 모바일 화면 높이 자동 조정
- `dayMaxEvents: 3` 으로 월 뷰에서 일별 이벤트 최대 표시 수 제한 (+N more 링크)
- 모바일에서 주/일 뷰 숨기기: `headerToolbar.right = 'dayGridMonth'`
