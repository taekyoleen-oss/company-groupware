import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)

// 1) Sign in as 결재자 to get access token
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'password',
})
if (signInErr) { console.error('sign-in failed:', signInErr); process.exit(1) }
const session = signIn.session
console.log('✓ 결재자 로그인 OK')

const cookieValue = encodeURIComponent(JSON.stringify({
  access_token:  session.access_token,
  refresh_token: session.refresh_token,
  token_type:    'bearer',
  expires_at:    session.expires_at,
  user:          session.user,
}))
// Supabase ssr cookie name pattern: sb-<project-ref>-auth-token (base64- prefix for chunked, but plain JSON works for ssr)
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const cookieHeader = `sb-${ref}-auth-token=${cookieValue}`

// 2) Find current pending vacation request
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: pending } = await admin
  .from('cg_vacation_requests')
  .select('id, title, status')
  .eq('status', 'pending')
  .limit(1)
if (!pending?.length) {
  console.log('대기 중인 휴가 신청이 없어 재시드합니다.')
  process.exit(2)
}
const reqId = pending[0].id
console.log(`✓ 대상 휴가 신청 id=${reqId}`)

// 3) Call local API
const r = await fetch(`http://localhost:3000/api/vacation/requests/${reqId}`, {
  method:  'PATCH',
  headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
  body:    JSON.stringify({ action: 'approve' }),
})
const text = await r.text()
console.log(`\nPATCH status: ${r.status}`)
console.log(`body: ${text}`)

// 4) Verify DB state
const { data: after } = await admin
  .from('cg_vacation_requests')
  .select('id, status, event_id, reviewed_by, reviewed_at')
  .eq('id', reqId).single()
console.log('\nDB 상태:', after)

const { data: ev } = await admin.from('cg_events').select('id, title, created_by').eq('id', after.event_id ?? '').maybeSingle()
console.log('생성된 이벤트:', ev)

const { data: msg } = await admin.from('cg_messages').select('id, content, recipient_id, recipient_name').order('created_at',{ascending:false}).limit(1).single()
console.log('최근 메시지:', msg)
