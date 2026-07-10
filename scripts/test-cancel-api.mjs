import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
  email: 'test@example.com', password: 'password',
})
if (signInErr) { console.error('sign-in failed:', signInErr); process.exit(1) }
const session = signIn.session
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const cookieHeader = `sb-${ref}-auth-token=` + encodeURIComponent(JSON.stringify({
  access_token: session.access_token, refresh_token: session.refresh_token,
  token_type: 'bearer', expires_at: session.expires_at, user: session.user,
}))

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: pendings } = await admin.from('cg_vacation_cancel_requests')
  .select('id, event_id, status, reason').eq('status', 'pending').limit(1)
if (!pendings?.length) { console.error('대기 취소 요청 없음'); process.exit(2) }
const id = pendings[0].id
const eventId = pendings[0].event_id
console.log(`✓ 취소 요청 id=${id}, 이벤트 id=${eventId}`)

const r = await fetch(`http://localhost:3000/api/vacation-cancel-requests/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
  body: JSON.stringify({ action: 'approve' }),
})
console.log(`\nPATCH status: ${r.status}`)
console.log(`body: ${await r.text()}`)

const { data: after } = await admin.from('cg_vacation_cancel_requests')
  .select('id, status, reviewed_by, reviewed_at, event_title').eq('id', id).single()
console.log('\n취소 요청 DB:', after)

const { data: ev } = await admin.from('cg_events').select('id').eq('id', eventId).maybeSingle()
console.log('이벤트 (삭제되었는지):', ev)

const { data: msg } = await admin.from('cg_messages').select('content, recipient_name')
  .order('created_at', { ascending: false }).limit(1).single()
console.log('최근 메시지:', msg)
