import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// KST(+9)로 변환하여 날짜 문자열(YYYY-MM-DD) 반환
function toKSTDate(isoStr: string): string {
  const utc = new Date(isoStr).getTime()
  return new Date(utc + 9 * 3600000).toISOString().slice(0, 10)
}

function calcDays(startAt: string, endAt: string): number {
  const s = new Date(toKSTDate(startAt))
  const e = new Date(toKSTDate(endAt))
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentYear = new Date().getFullYear()

  // 이 연도의 할당량 조회 (없으면 기본 10일)
  const { data: allocation } = await supabase
    .from('cg_vacation_allocations')
    .select('total_days')
    .eq('user_id', user.id)
    .eq('year', currentYear)
    .single()

  const totalDays = allocation?.total_days ?? 10

  // 이 연도의 휴가 이벤트 조회 (범위를 넓게 잡고 KST 기준 필터링)
  const { data: events } = await supabase
    .from('cg_events')
    .select('id, title, start_at, end_at')
    .eq('created_by', user.id)
    .eq('is_vacation', true)
    .gte('start_at', `${currentYear - 1}-12-22T00:00:00.000Z`)
    .lte('start_at', `${currentYear}-12-31T23:59:59.999Z`)
    .order('start_at', { ascending: false })

  const history = (events ?? [])
    .filter(e => {
      const kstYear = parseInt(toKSTDate(e.start_at).slice(0, 4))
      return kstYear === currentYear
    })
    .map(e => ({
      id: e.id,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at,
      start_date: toKSTDate(e.start_at),
      end_date: toKSTDate(e.end_at),
      days: calcDays(e.start_at, e.end_at),
    }))

  const usedDays = history.reduce((sum, e) => sum + e.days, 0)

  return NextResponse.json({
    year: currentYear,
    total_days: totalDays,
    used_days: usedDays,
    remaining_days: totalDays - usedDays,
    history,
  })
}
