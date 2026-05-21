// 기존 회원 전부 삭제(test@example.com 제외) 후 신규 회원 일괄 등록
// - 사장님(정연하) + 마켓브로커(7) → role=admin, approver_id=NULL (본인 결재)
// - 안기혜 → role=admin, approver_id=NULL (본인 결재 + 인하우스 결재자)
// - 인하우스브로커(9) → role=member, approver_id=안기혜
// 비밀번호: password
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const KEEP_EMAIL = 'test@example.com'
const PASSWORD = 'password'

// ── 신규 회원 정의 ────────────────────────────────────────────
const PRESIDENT = [
  { name: '정연하', email: 'yhchung@howdenkorea.com' },
]
const MARKET = [
  { name: '강신홍', email: 'shinhong.kang@howdenkorea.com' },
  { name: '신동환', email: 'dhshin@howdenkorea.com' },
  { name: '김재민', email: 'accloud@howdenkorea.com' },
  { name: '이현태', email: 'htlee@howdenkorea.com' },
  { name: '유정곤', email: 'suyuryu@howdenkorea.com' },
  { name: '박성주', email: 'sjamespark@howdenkorea.com' },
  { name: '도기완', email: 'dokeewan@howdenkorea.com' },
]
const INHOUSE_LEAD = { name: '안기혜', email: 'pageahn@howdenkorea.com' }
const INHOUSE_MEMBERS = [
  { name: '정원식', email: 'wschung@howdenkorea.com' },
  { name: '최수미', email: 'soomichoi@howdenkorea.com' },
  { name: '김가영', email: 'stephaniekim@howdenkorea.com' },
  { name: '고은솔', email: 'eunsolko@howdenkorea.com' },
  { name: '김수연', email: 'sooyeonkim@howdenkorea.com' },
  { name: '문서영', email: 'amymoon@howdenkorea.com' },
  { name: '권기륜', email: 'keekwon@howdenkorea.com' },
  { name: '노제희', email: 'jeheeroh@howdenkorea.com' },
  { name: '유연재', email: 'florayoo@howdenkorea.com' },
]

// ── STEP 1: 기존 데이터 정리 ─────────────────────────────────────
console.log('[1/6] 기존 사용자 데이터 정리 중...')

// FK가 ON DELETE RESTRICT/SET NULL 인 cg_vacation_cancel_requests 먼저 제거
{
  const { error } = await supabase.from('cg_vacation_cancel_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) { console.error('cg_vacation_cancel_requests 삭제 실패:', error); process.exit(1) }
}

// 보존할 프로필
const { data: keepProfile, error: keepErr } = await supabase
  .from('cg_profiles')
  .select('id, full_name, email')
  .eq('email', KEEP_EMAIL)
  .single()
if (keepErr || !keepProfile) { console.error('보존할 프로필을 찾지 못했습니다:', keepErr); process.exit(1) }
const KEEP_ID = keepProfile.id
console.log(`   보존: ${keepProfile.full_name} <${keepProfile.email}>  id=${KEEP_ID}`)

// ── STEP 2: 기존 auth 사용자 삭제 (cascade로 profile/events/notices/todos/vacation_requests/attendance 제거) ──
console.log('[2/6] auth 사용자 삭제 중...')
{
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) { console.error('listUsers 실패:', error); process.exit(1) }
  for (const u of data.users) {
    if (u.id === KEEP_ID) continue
    const { error: dErr } = await supabase.auth.admin.deleteUser(u.id)
    if (dErr) { console.error(`  - ${u.email} 삭제 실패:`, dErr.message); process.exit(1) }
    console.log(`  - 삭제: ${u.email}`)
  }
}

// ── STEP 3: 팀 정리 ─────────────────────────────────────────────
console.log('[3/6] 팀 재구성 중...')
// 기존 팀 전부 삭제 → cg_profiles.team_id는 ON DELETE SET NULL
{
  const { error } = await supabase.from('cg_teams').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) { console.error('팀 삭제 실패:', error); process.exit(1) }
}
// 신규 팀 생성
const teamNames = ['사장님', '마켓브로커', '인하우스브로커']
const teamByName = {}
for (const name of teamNames) {
  const { data, error } = await supabase.from('cg_teams').insert({ name }).select('id, name').single()
  if (error) { console.error(`팀 ${name} 생성 실패:`, error); process.exit(1) }
  teamByName[name] = data.id
  console.log(`  + 팀: ${name} (${data.id})`)
}

// ── STEP 4: 신규 auth 사용자 생성 ────────────────────────────────
console.log('[4/6] 신규 auth 사용자 생성 중...')
async function createAuth(name, email) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  })
  if (error) { console.error(`  ${email} 생성 실패:`, error.message); process.exit(1) }
  console.log(`  + ${name.padEnd(6)} ${email}`)
  return data.user.id
}

const created = {} // email -> { id, name, team, role, isLead }

// 사장님
for (const u of PRESIDENT) {
  const id = await createAuth(u.name, u.email)
  created[u.email] = { id, name: u.name, team: '사장님', role: 'admin', isLead: false }
}
// 마켓브로커 (전원 admin, self-approve)
for (const u of MARKET) {
  const id = await createAuth(u.name, u.email)
  created[u.email] = { id, name: u.name, team: '마켓브로커', role: 'admin', isLead: false }
}
// 인하우스 리드 (안기혜) 먼저 생성 → 다른 인하우스 회원의 approver로 지정
{
  const id = await createAuth(INHOUSE_LEAD.name, INHOUSE_LEAD.email)
  created[INHOUSE_LEAD.email] = { id, name: INHOUSE_LEAD.name, team: '인하우스브로커', role: 'admin', isLead: true }
}
// 나머지 인하우스 (member, approver=안기혜)
for (const u of INHOUSE_MEMBERS) {
  const id = await createAuth(u.name, u.email)
  created[u.email] = { id, name: u.name, team: '인하우스브로커', role: 'member', isLead: false }
}

const inhouseLeadId = created[INHOUSE_LEAD.email].id

// ── STEP 5: 프로필 보정 (full_name, role, status, team_id, approver_id) ──
console.log('[5/6] 프로필 보정 중...')
for (const [email, info] of Object.entries(created)) {
  const update = {
    full_name: info.name,
    role: info.role,
    status: 'active',
    team_id: teamByName[info.team] ?? null,
    approver_id: info.team === '인하우스브로커' && !info.isLead ? inhouseLeadId : null,
  }
  const { error } = await supabase.from('cg_profiles').update(update).eq('id', info.id)
  if (error) { console.error(`  ${email} 프로필 업데이트 실패:`, error.message); process.exit(1) }
}
console.log(`  ✓ ${Object.keys(created).length}명 보정 완료`)

// ── STEP 6: 보존 계정의 team_id 정리 (관리부 팀이 삭제되어 이미 NULL) ──
console.log('[6/6] 최종 검증')
const { data: finalProfiles } = await supabase
  .from('cg_profiles')
  .select('full_name, email, role, status, team_id, approver_id, cg_teams(name)')
  .order('created_at')

const idToName = new Map(Object.values(created).map(c => [c.id, c.name]))
idToName.set(KEEP_ID, keepProfile.full_name)

console.log('\n=== 최종 프로필 ===')
console.log('이름      이메일                              팀              역할     결재자')
console.log('-'.repeat(100))
for (const p of finalProfiles) {
  const team = p.cg_teams?.name ?? '(없음)'
  const approver = p.approver_id ? (idToName.get(p.approver_id) ?? p.approver_id.slice(0, 8)) : '(본인 결재)'
  console.log(`${(p.full_name ?? '').padEnd(8)} ${(p.email ?? '').padEnd(36)} ${team.padEnd(14)} ${p.role.padEnd(8)} ${approver}`)
}

console.log('\n완료. 비밀번호: ', PASSWORD)
