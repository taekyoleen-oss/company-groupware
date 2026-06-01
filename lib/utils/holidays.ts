import type { EventInput } from '@fullcalendar/core'
import { KOREAN_HOLIDAYS, HOLIDAY_DATE_SET } from './koreanHolidays'

// 회원별 공휴일 표시 국가/지역
export type HolidayRegion =
  | 'KR'      // 한국 (큐레이션 데이터 — 2024~2027, 대체공휴일·지방선거 포함)
  | 'US'      // 미국
  | 'JP'      // 일본
  | 'GB-ENG'  // 영국 잉글랜드·웨일스
  | 'GB-SCT'  // 영국 스코틀랜드
  | 'GB-NIR'  // 영국 북아일랜드
  | 'SG'      // 싱가포르
  | 'HK'      // 홍콩
  | 'NONE'    // 공휴일 표시 안 함

export const DEFAULT_HOLIDAY_REGION: HolidayRegion = 'KR'

export const HOLIDAY_REGION_OPTIONS: { value: HolidayRegion; label: string }[] = [
  { value: 'KR',     label: '🇰🇷 한국' },
  { value: 'US',     label: '🇺🇸 미국' },
  { value: 'JP',     label: '🇯🇵 일본' },
  { value: 'GB-ENG', label: '🇬🇧 영국(잉글랜드·웨일스)' },
  { value: 'GB-SCT', label: '🇬🇧 영국(스코틀랜드)' },
  { value: 'GB-NIR', label: '🇬🇧 영국(북아일랜드)' },
  { value: 'SG',     label: '🇸🇬 싱가포르' },
  { value: 'HK',     label: '🇭🇰 홍콩' },
  { value: 'NONE',   label: '공휴일 표시 안 함' },
]

export function isHolidayRegion(v: unknown): v is HolidayRegion {
  return typeof v === 'string' && HOLIDAY_REGION_OPTIONS.some(o => o.value === v)
}

// ──────────────────────────────────────────────────────────────
// 해외 공휴일 데이터 (holidays-2026-spec.md §8 기준, 2026년)
//   date    = 실제 쉬는 날(대체 적용 후) — 캘린더에 마킹할 날
//   sub     = 대체/관찰 휴일 (Independence Day(observed) 등)
//   tent    = 달 관측 등으로 미확정(잠정)
// ⚠️ 음력/이슬람력/부활절·대체휴일은 연도마다 달라지므로 매년 갱신 필요(스펙 §9).
//    한국은 별도 큐레이션 데이터(koreanHolidays.ts, 2024~2027)를 사용한다.
// ──────────────────────────────────────────────────────────────
type RawHoliday = { name: string; date: string; sub?: boolean; tent?: boolean }

type ForeignRegion = Exclude<HolidayRegion, 'KR' | 'NONE'>

const FOREIGN_HOLIDAYS_2026: Record<ForeignRegion, RawHoliday[]> = {
  // 🇺🇸 미국 — 토 → 직전 금 / 일 → 다음 월
  US: [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: 'Martin Luther King Jr. Day', date: '2026-01-19' },
    { name: "Presidents' Day", date: '2026-02-16' },
    { name: 'Memorial Day', date: '2026-05-25' },
    { name: 'Juneteenth', date: '2026-06-19' },
    { name: 'Independence Day', date: '2026-07-03', sub: true },
    { name: 'Labor Day', date: '2026-09-07' },
    { name: 'Columbus Day', date: '2026-10-12' },
    { name: 'Veterans Day', date: '2026-11-11' },
    { name: 'Thanksgiving', date: '2026-11-26' },
    { name: 'Christmas Day', date: '2026-12-25' },
  ],
  // 🇯🇵 일본 — 일 → 다음 월(振替休日) + 샌드위치(국민의 휴일)
  JP: [
    { name: "New Year's Day (元日)", date: '2026-01-01' },
    { name: 'Coming of Age Day (成人の日)', date: '2026-01-12' },
    { name: 'National Foundation Day (建国記念の日)', date: '2026-02-11' },
    { name: "Emperor's Birthday (天皇誕生日)", date: '2026-02-23' },
    { name: 'Vernal Equinox Day (春分の日)', date: '2026-03-20' },
    { name: 'Showa Day (昭和の日)', date: '2026-04-29' },
    { name: 'Constitution Memorial Day (憲法記念日)', date: '2026-05-06', sub: true },
    { name: 'Greenery Day (みどりの日)', date: '2026-05-04' },
    { name: "Children's Day (こどもの日)", date: '2026-05-05' },
    { name: 'Marine Day (海の日)', date: '2026-07-20' },
    { name: 'Mountain Day (山の日)', date: '2026-08-11' },
    { name: 'Respect for the Aged Day (敬老の日)', date: '2026-09-21' },
    { name: "Citizens' Holiday (国民の休日)", date: '2026-09-22' },
    { name: 'Autumnal Equinox Day (秋分の日)', date: '2026-09-23' },
    { name: 'Sports Day (スポーツの日)', date: '2026-10-12' },
    { name: 'Culture Day (文化の日)', date: '2026-11-03' },
    { name: 'Labor Thanksgiving Day (勤労感謝の日)', date: '2026-11-23' },
  ],
  // 🇬🇧 영국 — 잉글랜드·웨일스 (8일)
  'GB-ENG': [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: 'Good Friday', date: '2026-04-03' },
    { name: 'Easter Monday', date: '2026-04-06' },
    { name: 'Early May Bank Holiday', date: '2026-05-04' },
    { name: 'Spring Bank Holiday', date: '2026-05-25' },
    { name: 'Summer Bank Holiday', date: '2026-08-31' },
    { name: 'Christmas Day', date: '2026-12-25' },
    { name: 'Boxing Day', date: '2026-12-28', sub: true },
  ],
  // 🇬🇧 영국 — 스코틀랜드 (10일, Easter Monday 없음 / Summer BH 8/3)
  'GB-SCT': [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: '2nd January', date: '2026-01-02' },
    { name: 'Good Friday', date: '2026-04-03' },
    { name: 'Early May Bank Holiday', date: '2026-05-04' },
    { name: 'Spring Bank Holiday', date: '2026-05-25' },
    { name: 'World Cup Holiday (one-off)', date: '2026-06-15' },
    { name: 'Summer Bank Holiday', date: '2026-08-03' },
    { name: "St Andrew's Day", date: '2026-11-30' },
    { name: 'Christmas Day', date: '2026-12-25' },
    { name: 'Boxing Day', date: '2026-12-28', sub: true },
  ],
  // 🇬🇧 영국 — 북아일랜드 (10일)
  'GB-NIR': [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: "St Patrick's Day", date: '2026-03-17' },
    { name: 'Good Friday', date: '2026-04-03' },
    { name: 'Easter Monday', date: '2026-04-06' },
    { name: 'Early May Bank Holiday', date: '2026-05-04' },
    { name: 'Spring Bank Holiday', date: '2026-05-25' },
    { name: 'Battle of the Boyne', date: '2026-07-13', sub: true },
    { name: 'Summer Bank Holiday', date: '2026-08-31' },
    { name: 'Christmas Day', date: '2026-12-25' },
    { name: 'Boxing Day', date: '2026-12-28', sub: true },
  ],
  // 🇸🇬 싱가포르 — 일 → 다음 월만 (토요일 무보상)
  SG: [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: 'Chinese New Year (Day 1)', date: '2026-02-17' },
    { name: 'Chinese New Year (Day 2)', date: '2026-02-18' },
    { name: 'Hari Raya Puasa', date: '2026-03-21', tent: true },
    { name: 'Good Friday', date: '2026-04-03' },
    { name: 'Labour Day', date: '2026-05-01' },
    { name: 'Hari Raya Haji', date: '2026-05-27', tent: true },
    { name: 'Vesak Day', date: '2026-06-01', sub: true },
    { name: 'National Day', date: '2026-08-10', sub: true },
    { name: 'Deepavali', date: '2026-11-09', sub: true },
    { name: 'Christmas Day', date: '2026-12-25' },
  ],
  // 🇭🇰 홍콩 — 일 → 다음 비공휴일 평일까지 캐스케이딩
  HK: [
    { name: "New Year's Day", date: '2026-01-01' },
    { name: 'Lunar New Year (Day 1)', date: '2026-02-17' },
    { name: 'Lunar New Year (Day 2)', date: '2026-02-18' },
    { name: 'Lunar New Year (Day 3)', date: '2026-02-19' },
    { name: 'Good Friday', date: '2026-04-03' },
    { name: 'Day following Good Friday', date: '2026-04-04' },
    { name: 'Day following Ching Ming Festival', date: '2026-04-06', sub: true },
    { name: 'Day following Easter Monday', date: '2026-04-07', sub: true },
    { name: 'Labour Day', date: '2026-05-01' },
    { name: "Day following Buddha's Birthday", date: '2026-05-25', sub: true },
    { name: 'Tuen Ng Festival', date: '2026-06-19' },
    { name: 'HKSAR Establishment Day', date: '2026-07-01' },
    { name: 'Day following Mid-Autumn Festival', date: '2026-09-26' },
    { name: 'National Day', date: '2026-10-01' },
    { name: 'Day following Chung Yeung Festival', date: '2026-10-19', sub: true },
    { name: 'Christmas Day', date: '2026-12-25' },
    { name: 'First weekday after Christmas Day', date: '2026-12-26' },
  ],
}

export interface HolidayData {
  events: EventInput[]
  dateSet: Set<string>
}

const EMPTY: HolidayData = { events: [], dateSet: new Set() }

function toEvent(region: HolidayRegion, it: RawHoliday, seq: number): EventInput {
  const suffix = it.sub ? ' (observed)' : it.tent ? ' (tentative)' : ''
  return {
    id: `holiday-${region}-${it.date}-${seq}`,
    title: it.name + suffix,
    start: it.date,
    allDay: true,
    editable: false,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    textColor: '#DC2626',
  }
}

/**
 * 선택한 국가/지역의 공휴일을 FullCalendar 이벤트 + 날짜 Set 으로 변환한다.
 * - KR  : 큐레이션 데이터(2024~2027)
 * - NONE: 빈 결과 (공휴일 표시 안 함)
 * - 그 외: 스펙 §8 의 2026 데이터셋
 */
export function buildHolidays(region: HolidayRegion): HolidayData {
  if (region === 'NONE') return EMPTY
  if (region === 'KR') return { events: KOREAN_HOLIDAYS, dateSet: HOLIDAY_DATE_SET }

  const raw = FOREIGN_HOLIDAYS_2026[region]
  const dateSet = new Set<string>()
  const events = raw.map((it, i) => {
    dateSet.add(it.date)
    return toEvent(region, it, i)
  })
  return { events, dateSet }
}
