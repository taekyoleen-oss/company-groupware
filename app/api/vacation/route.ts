import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countWorkdays } from '@/lib/utils/holidayDates'

// KST(+9)로 변환하여 날짜 문자열(YYYY-MM-DD) 반환
function toKSTDate(isoStr: string): string {
  const utc = new Date(isoStr).getTime()
  return new Date(utc + 9 * 3600000).toISOString().slice(0, 10)
}

function calcDays(startAt: string, endAt: string, isAllDay: boolean): number {
  if (!isAllDay) return 0.5
  return countWorkdays(toKSTDate(startAt), toKSTDate(endAt))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentYear = new Date().getFullYear()

  // 할당량
  const { data: allocation } = await supabase
    .from('cg_vacation_allocations')
    .select('total_days')
    .eq('user_id', user.id)
    .eq('year', currentYear)
    .single()

  const totalDays = allocation?.total_days ?? 10

  // 승인된 휴가 이벤트
  const { data: events } = await supabase
    .from('cg_events')
    .select('id, title, start_at, end_at, is_all_day')
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
      days: calcDays(e.start_at, e.end_at, e.is_all_day ?? true),
    }))

  const usedDays = history.reduce((sum, e) => sum + e.days, 0)

  // 대기 중인 신청
  const { data: pendings } = await supabase
    .from('cg_vacation_requests')
    .select('id, title, start_at, end_at, is_all_day, created_at, approver_id, approver:cg_profiles!approver_id(id, full_name, color)')
    .eq('requested_by', user.id)
    .eq('status', 'pending')
    .gte('start_at', `${currentYear - 1}-12-22T00:00:00.000Z`)
    .lte('start_at', `${currentYear}-12-31T23:59:59.999Z`)
    .order('created_at', { ascending: false })

  const pendingList = (pendings ?? []).map((p: any) => ({
    id: p.id,
    title: p.title,
    start_at: p.start_at,
    end_at: p.end_at,
    is_all_day: p.is_all_day,
    created_at: p.created_at,
    approver: p.approver ?? null,
    days: calcDays(p.start_at, p.end_at, p.is_all_day ?? true),
  }))
  const pendingDays = pendingList.reduce((sum, p) => sum + p.days, 0)

  return NextResponse.json({
    year: currentYear,
    total_days: totalDays,
    used_days: usedDays,
    pending_days: pendingDays,
    remaining_days: totalDays - usedDays - pendingDays,
    history,
    pending_requests: pendingList,
  })
}
