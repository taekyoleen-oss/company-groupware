// 한국 공휴일 날짜 집합 (2024-2027) — 서버/클라이언트 공용
const FIXED_HOLIDAYS: string[] = (['2024', '2025', '2026', '2027'] as const).flatMap(y => [
  `${y}-01-01`, `${y}-03-01`, `${y}-05-05`, `${y}-06-06`,
  `${y}-08-15`, `${y}-10-03`, `${y}-10-09`, `${y}-12-25`,
])

const VARIABLE_HOLIDAYS: string[] = [
  // 2024
  '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12',
  '2024-05-06', '2024-05-15',
  '2024-09-16', '2024-09-17', '2024-09-18',
  // 2025
  '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-03', '2025-05-06',
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026
  '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-02',
  '2026-05-24', '2026-05-25',
  '2026-06-08', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28',
  '2026-10-05',
  // 2027
  '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
  '2027-05-13',
  '2027-06-07', '2027-08-16',
  '2027-10-04', '2027-10-11',
  '2027-10-14', '2027-10-15', '2027-10-16', '2027-10-18',
  '2027-12-27',
]

export const KOREAN_PUBLIC_HOLIDAY_DATES = new Set<string>([
  ...FIXED_HOLIDAYS,
  ...VARIABLE_HOLIDAYS,
])

/** 시작일~종료일 사이 영업일(평일+비공휴일) 수를 계산합니다. */
export function countWorkdays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    const dateStr = cur.toISOString().slice(0, 10)
    if (day !== 0 && day !== 6 && !KOREAN_PUBLIC_HOLIDAY_DATES.has(dateStr)) {
      count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}
