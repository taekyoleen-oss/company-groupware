import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// 1. Show profiles with approvers
const { data: profiles } = await supabase
  .from('cg_profiles')
  .select('id, full_name, email, role, approver_id, status')
  .eq('status', 'active')
  .order('created_at')

console.log('=== Profiles ===')
const idToName = new Map(profiles.map(p => [p.id, p.full_name]))
profiles.forEach(p => {
  const approverName = p.approver_id ? idToName.get(p.approver_id) ?? 'unknown' : '(없음)'
  console.log(`  ${p.full_name.padEnd(10)} ${p.email.padEnd(28)} ${p.role.padEnd(7)} approver=${approverName}`)
})

// 2. Find a member whose approver is NOT themselves and approver exists, and has vacation_balance
const target = profiles.find(p =>
  p.approver_id && p.approver_id !== p.id && p.role !== 'admin'
)
if (!target) { console.error('적절한 결재 대상자를 찾지 못했습니다.'); process.exit(1) }
console.log(`\n→ 신청자: ${target.full_name} (${target.email})`)
console.log(`→ 결재자: ${idToName.get(target.approver_id)}`)

// 3. Insert a pending vacation request for tomorrow
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
const yyyy = tomorrow.getFullYear()
const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
const dd = String(tomorrow.getDate()).padStart(2, '0')
const startAt = `${yyyy}-${mm}-${dd}T00:00:00+09:00`
const endAt = `${yyyy}-${mm}-${dd}T23:59:59+09:00`

// Clean up any existing pending request for the same user/day to keep test deterministic
await supabase.from('cg_vacation_requests')
  .delete()
  .eq('requested_by', target.id)
  .eq('status', 'pending')

const { data: vacReq, error: vacErr } = await supabase
  .from('cg_vacation_requests')
  .insert({
    requested_by: target.id,
    approver_id: target.approver_id,
    title: '[테스트] 휴가 신청 — 승인 흐름 테스트',
    description: 'Playwright 자동 테스트용 휴가 신청',
    start_at: startAt,
    end_at: endAt,
    is_all_day: true,
    status: 'pending',
  })
  .select('id, title, start_at, end_at, status')
  .single()

if (vacErr) { console.error('휴가 신청 생성 실패:', vacErr); process.exit(1) }
console.log(`\n✓ 휴가 신청 생성됨: ${vacReq.id}`)
console.log(`   ${vacReq.title}  (${vacReq.status})`)

console.log(`\n다음 단계: 결재자(${idToName.get(target.approver_id)}) 로 로그인 후 프로필 → 휴가 탭에서 승인`)
