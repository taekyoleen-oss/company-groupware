import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp, ipMatchesCidr } from '@/lib/utils/cidr'

// KST(UTC+9) 기준 오늘 날짜
function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

// 주어진 KST 날짜의 18:00에 해당하는 UTC ISO 문자열
function kstDateToSixPmUtcIso(kstDate: string): string {
  // 18:00 KST == 09:00 UTC
  return new Date(`${kstDate}T09:00:00.000Z`).toISOString()
}

// POST: 본인 퇴근 처리 (사무실 IP 안에서만)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { date?: string }
  const date = body.date ?? kstToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  // 사무실 네트워크 안인지 확인
  const clientIp = getClientIp(request)
  const { data: networks } = await supabase
    .from('cg_office_networks')
    .select('id, cidr')
  const matched = clientIp ? (networks ?? []).find(n => ipMatchesCidr(clientIp, n.cidr)) : null
  if (!matched) {
    return NextResponse.json(
      { error: '사무실 네트워크에서만 퇴근 확인이 가능합니다.', current_ip: clientIp },
      { status: 403 }
    )
  }

  // 오늘 출근 기록이 있어야 한다
  const { data: row, error: selErr } = await supabase
    .from('cg_attendance')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
  if (!row) {
    return NextResponse.json({ error: '먼저 출근 확인을 해주세요.' }, { status: 400 })
  }

  // 이미 퇴근 처리되어 있으면 그대로 반환 (멱등)
  if ((row as any).checked_out_at) {
    return NextResponse.json(row)
  }

  const { data: updated, error: updErr } = await supabase
    .from('cg_attendance')
    .update({ checked_out_at: new Date().toISOString() } as never)
    .eq('id', (row as any).id)
    .select('*')
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json(updated)
}

// PATCH: 미입력 상태로 다음날로 넘어간 과거 출근 행을 18:00 KST 로 자동 보정
//   - 클라이언트가 출근/프로필 화면 진입 시 best-effort 로 호출
//   - 인증된 본인의 행만 보정 (RLS에 의해 자연 보호)
export async function PATCH() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = kstToday()

  const { data: pending, error: selErr } = await supabase
    .from('cg_attendance')
    .select('*')
    .eq('user_id', user.id)
    .is('checked_out_at' as never, null)
    .lt('date', today)
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

  const rows = (pending ?? []) as Array<{ id: string; date: string; checked_out_at?: string | null }>
  if (rows.length === 0) return NextResponse.json({ patched: 0 })

  // 각 행을 그 날짜의 18:00 KST 로 보정
  let patched = 0
  for (const r of rows) {
    const sixPm = kstDateToSixPmUtcIso(r.date)
    const { error } = await supabase
      .from('cg_attendance')
      .update({ checked_out_at: sixPm } as never)
      .eq('id', r.id)
    if (!error) patched++
  }

  return NextResponse.json({ patched })
}
