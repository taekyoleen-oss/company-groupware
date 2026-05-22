// 출근 플로우 E2E 검증 스크립트
// - 일반 사용자로 로그인 → 출근 체크 → 영속성 확인
// - 앱관리자로 로그인 → 출근 목록 / PC 디바이스 확인
//
// 실행 전 dev 서버 (npm run dev) 가 http://localhost:3000 에서 응답해야 함
// 출근 IP 화이트리스트에 127.0.0.1 / 가상 IP 를 임시 등록 후 정리한다.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY     = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC_KEY      = env.SUPABASE_SERVICE_ROLE_KEY
const BASE         = 'http://localhost:3000'
const SPOOF_IP     = '203.0.113.42'   // 가상의 사무실 IP

const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]
function cookieHeaderFromSession(session) {
  const value = encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    expires_at: session.expires_at,
    user: session.user,
  }))
  return `sb-${projectRef}-auth-token=${value}`
}

const admin = createClient(SUPABASE_URL, SVC_KEY, { auth: { persistSession: false } })

// ── helpers ────────────────────────────────────────────────
function log(step, status, extra = '') {
  const mark = status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '·'
  console.log(`${mark} ${step}${extra ? ' — ' + extra : ''}`)
}

async function signIn(email, password) {
  const c = createClient(SUPABASE_URL, ANON_KEY)
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email} failed: ${error.message}`)
  return data.session
}

async function api(path, opts = {}, cookie) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (cookie) headers.cookie = cookie
  // 가상 사무실 IP 주입 (Next.js getClientIp 는 x-forwarded-for 도 인식)
  headers['x-forwarded-for'] = SPOOF_IP
  const r = await fetch(`${BASE}${path}`, { ...opts, headers })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

// ── setup: 두 명의 테스트 사용자 보장 ──────────────────────
async function ensureUsers() {
  // 앱관리자 (seed: test@example.com / password)
  const { data: admins } = await admin
    .from('cg_profiles')
    .select('id, full_name')
    .eq('is_super_admin', true)
    .limit(1)
  if (!admins?.length) throw new Error('앱관리자가 없습니다.')
  const adminProfile = admins[0]

  // 일반 사용자 — 앱관리자가 아닌 active 사용자 한 명
  const { data: members } = await admin
    .from('cg_profiles')
    .select('id, full_name, status, role, is_super_admin')
    .neq('is_super_admin', true)
    .eq('status', 'active')
    .limit(1)
  if (!members?.length) throw new Error('일반 사용자가 없습니다.')
  const memberProfile = members[0]

  // 두 계정의 auth user 조회 (이메일 확인용)
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers()
  const adminAuth = authUsers.find(u => u.id === adminProfile.id)
  const memberAuth = authUsers.find(u => u.id === memberProfile.id)

  if (!adminAuth?.email) throw new Error('앱관리자 이메일을 알 수 없습니다.')
  if (!memberAuth?.email) throw new Error('테스트 멤버 이메일을 알 수 없습니다.')

  return {
    adminEmail: adminAuth.email,
    memberEmail: memberAuth.email,
    adminProfile,
    memberProfile,
  }
}

// ── setup: 가상 IP 등록 ────────────────────────────────────
async function ensureSpoofNetwork() {
  const cidr = `${SPOOF_IP}/32`
  const { data: existing } = await admin
    .from('cg_office_networks').select('id').eq('cidr', cidr).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await admin
    .from('cg_office_networks')
    .insert({ cidr, label: 'TEST: 가상 IP' })
    .select('id').single()
  if (error) throw new Error('가상 IP 등록 실패: ' + error.message)
  return data.id
}

async function cleanupSpoofNetwork(id) {
  if (!id) return
  await admin.from('cg_office_networks').delete().eq('id', id)
}

// 테스트가 끝나면 깨끗하게 정리
async function cleanupAttendanceAndDevice(memberId) {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  await admin.from('cg_attendance').delete().eq('user_id', memberId).eq('date', today)
  // 테스트 UA 로 등록된 디바이스만 삭제
  await admin.from('cg_office_devices').delete().eq('user_id', memberId).eq('user_agent', 'attendance-flow-test')
}

// ── main ───────────────────────────────────────────────────
let cleanupNetId = null
let memberId = null
try {
  console.log('\n=== 출근 플로우 E2E 검증 ===\n')

  // [SETUP]
  const { adminEmail, memberEmail, adminProfile, memberProfile } = await ensureUsers()
  memberId = memberProfile.id
  log('SETUP', 'OK', `admin=${adminEmail} member=${memberEmail} (${memberProfile.full_name})`)

  cleanupNetId = await ensureSpoofNetwork()
  log('가상 IP 등록', 'OK', `${SPOOF_IP}/32`)

  // 이전 테스트 잔재 정리
  await cleanupAttendanceAndDevice(memberProfile.id)

  // [Step 1] 일반 사용자 로그인 → 출근 확인
  console.log('\n--- Step 1: 사용자 출근 체크 ---')
  const memberSession = await signIn(memberEmail, 'password')
  const memberCookie = cookieHeaderFromSession(memberSession)
  log('일반 사용자 로그인', 'OK')

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const postRes = await api('/api/attendance', {
    method: 'POST',
    body: JSON.stringify({ date: today }),
  }, memberCookie)

  if (postRes.status !== 201 && postRes.status !== 200) {
    log('POST /api/attendance', 'FAIL', `status=${postRes.status} body=${JSON.stringify(postRes.body)}`)
    process.exit(1)
  }
  log('POST /api/attendance', 'OK', `status=${postRes.status} checked_in_at=${postRes.body.checked_in_at} method=${postRes.body.method}`)

  // [Step 2] 같은 사용자가 GET 으로 출근 상태 확인
  console.log('\n--- Step 2: 출근 상태 영속성 확인 ---')
  const getRes = await api(`/api/attendance?date=${today}`, { method: 'GET' }, memberCookie)
  if (getRes.status !== 200 || !getRes.body || !getRes.body.checked_in_at) {
    log('GET /api/attendance', 'FAIL', `status=${getRes.status} body=${JSON.stringify(getRes.body)}`)
    process.exit(1)
  }
  log('GET /api/attendance', 'OK', `checked_in_at=${getRes.body.checked_in_at}`)

  // 동일 POST 다시 보내기 — 멱등성 (200 으로 같은 row 반환)
  const postAgain = await api('/api/attendance', {
    method: 'POST',
    body: JSON.stringify({ date: today }),
  }, memberCookie)
  if (postAgain.status !== 200 || postAgain.body.checked_in_at !== getRes.body.checked_in_at) {
    log('POST 멱등성', 'FAIL', `status=${postAgain.status}`)
    process.exit(1)
  }
  log('POST 멱등성 (재호출 시 200)', 'OK')

  // [Step 3] 사용자가 PC 등록 요청
  console.log('\n--- Step 3: PC 등록 요청 ---')
  const regRes = await api('/api/attendance/device-register', {
    method: 'POST',
    headers: { 'user-agent': 'attendance-flow-test' },
    body: JSON.stringify({ device_label: 'TEST 자리 PC' }),
  }, memberCookie)
  if (regRes.status !== 201 && regRes.status !== 200) {
    log('POST /api/attendance/device-register', 'FAIL', `status=${regRes.status} body=${JSON.stringify(regRes.body)}`)
    process.exit(1)
  }
  log('POST /api/attendance/device-register', 'OK', `status=${regRes.body.status} label=${regRes.body.device_label}`)

  // [Step 4] 앱관리자 로그인 → 출근 / 디바이스 조회
  console.log('\n--- Step 4: 앱관리자 view ---')
  const adminSession = await signIn(adminEmail, 'password')
  const adminCookie = cookieHeaderFromSession(adminSession)
  log('앱관리자 로그인', 'OK')

  // 4a. 오늘 출근 목록 (관리자 뷰)
  const adminAtt = await api(`/api/admin/attendance?date=${today}`, { method: 'GET' }, adminCookie)
  if (adminAtt.status !== 200) {
    log('GET /api/admin/attendance', 'FAIL', `status=${adminAtt.status}`)
    process.exit(1)
  }
  const memberRow = (adminAtt.body.records ?? []).find(r => r.id === memberProfile.id)
  if (!memberRow || !memberRow.checked_in_at) {
    log('관리자 → 출근 인지', 'FAIL', `target member not checked-in in admin view`)
    process.exit(1)
  }
  log('관리자 → 출근 인지', 'OK', `${memberRow.full_name} 출근 @ ${memberRow.checked_in_at} (method=${memberRow.method})`)

  // 4b. 등록된 PC 목록 (관리자 뷰)
  const adminDev = await api('/api/admin/office-devices', { method: 'GET' }, adminCookie)
  if (adminDev.status !== 200) {
    log('GET /api/admin/office-devices', 'FAIL', `status=${adminDev.status}`)
    process.exit(1)
  }
  const testDevice = (adminDev.body ?? []).find(d => d.user_id === memberProfile.id && d.user_agent === 'attendance-flow-test')
  if (!testDevice) {
    log('관리자 → PC 인지', 'FAIL', '등록 요청한 PC 가 보이지 않음')
    process.exit(1)
  }
  log('관리자 → PC 인지', 'OK', `${testDevice.user?.full_name} · status=${testDevice.status} · label=${testDevice.device_label} · ip=${testDevice.last_ip}`)

  // [요약]
  console.log('\n=== 결과 요약 ===')
  console.log(`✓ 사용자 출근 체크 후 1일 영속 — DB 의 cg_attendance 에 ${memberProfile.full_name} ${today} 출근 기록 보존`)
  console.log(`✓ 관리자 view 에 출근 표시 — /api/admin/attendance 응답에 포함`)
  console.log(`✓ 관리자 view 에 PC 표시 — /api/admin/office-devices 응답에 ${testDevice.status} 상태로 포함`)
  console.log()

  // [CLEANUP]
  await cleanupAttendanceAndDevice(memberProfile.id)
  await cleanupSpoofNetwork(cleanupNetId)
  log('정리 (가상 IP / 테스트 출근·디바이스 삭제)', 'OK')

  console.log('\n🎉 모든 검증 통과\n')
  process.exit(0)
} catch (e) {
  console.error('\n검증 중 오류:', e?.message ?? e)
  // 정리 시도
  try {
    if (memberId) await cleanupAttendanceAndDevice(memberId)
    if (cleanupNetId) await cleanupSpoofNetwork(cleanupNetId)
    console.log('(정리 완료)')
  } catch {}
  process.exit(1)
}
