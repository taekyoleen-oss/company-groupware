import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: hong } = await supabase.from('cg_profiles')
  .select('id, full_name, approver_id').eq('email', 'test_1@example.com').single()

// 1. Create a vacation event (approved 휴가) for 홍길동 the day after tomorrow
const d = new Date(); d.setDate(d.getDate() + 2)
const yyyy = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0')

const { data: event, error: evErr } = await supabase.from('cg_events').insert({
  title: '[테스트] 휴가 — 취소 결재 테스트',
  description: 'Playwright 자동 테스트용 휴가',
  start_at: `${yyyy}-${mm}-${dd}T00:00:00+09:00`,
  end_at: `${yyyy}-${mm}-${dd}T23:59:59+09:00`,
  is_all_day: true,
  is_vacation: true,
  visibility: 'company',
  color: '#F97316',
  category_id: null,
  created_by: hong.id,
  team_id: null,
}).select('id').single()

if (evErr) { console.error('이벤트 생성 실패:', evErr); process.exit(1) }
console.log('✓ 휴가 이벤트 생성:', event.id)

// 2. 기존 동일 신청자 pending 취소 요청 정리
await supabase.from('cg_vacation_cancel_requests').delete()
  .eq('requested_by', hong.id).eq('status', 'pending')

// 3. Pending cancel request
const { data: cancel, error: cancelErr } = await supabase.from('cg_vacation_cancel_requests')
  .insert({
    event_id: event.id,
    requested_by: hong.id,
    reason: 'Playwright 자동 테스트 — 휴가 취소 결재 흐름 확인',
    status: 'pending',
  }).select('id, status').single()

if (cancelErr) { console.error('취소 요청 생성 실패:', cancelErr); process.exit(1) }
console.log('✓ 휴가 취소 요청 생성:', cancel.id)
