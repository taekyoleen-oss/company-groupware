import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// 모든 이벤트를 작성자(회원)와 함께 조회
const { data: events, error } = await supabase
  .from('cg_events')
  .select('id, title, is_vacation, visibility, is_all_day, start_at, created_by, author:cg_profiles!created_by(full_name, email)')
  .order('start_at')

if (error) { console.error('조회 실패:', error); process.exit(1) }

// 회원별 집계
const byMember = new Map()
for (const e of events) {
  const name = e.author?.full_name ?? '(알수없음)'
  const key = `${name}|${e.author?.email ?? e.created_by}`
  if (!byMember.has(key)) {
    byMember.set(key, { name, email: e.author?.email ?? '', vacTrue: 0, vacFalseCompany: 0, vacFalseOther: 0, samples: [] })
  }
  const m = byMember.get(key)
  if (e.is_vacation === true) {
    m.vacTrue++
  } else if (e.visibility === 'company') {
    m.vacFalseCompany++
    m.samples.push(e)
  } else {
    m.vacFalseOther++
  }
}

console.log('\n========================================================================')
console.log('회원별 이벤트 플래그 분류')
console.log('  ☀️휴가(is_vacation=true) = 접두사 없음')
console.log('  [전사]표시(is_vacation=false & visibility=company) = [전사] 붙음')
console.log('========================================================================\n')

const rows = [...byMember.values()].sort((a, b) => b.vacFalseCompany - a.vacFalseCompany)
console.log('회원'.padEnd(12) + '☀️휴가(정상)'.padEnd(14) + '[전사]표시'.padEnd(12) + '기타이벤트')
console.log('-'.repeat(60))
for (const m of rows) {
  console.log(
    m.name.padEnd(12) +
    String(m.vacTrue).padEnd(16) +
    String(m.vacFalseCompany).padEnd(14) +
    String(m.vacFalseOther)
  )
}

// [전사]로 잘못 표시되는 이벤트 상세
console.log('\n\n========================================================================')
console.log('[전사]가 붙는 이벤트 상세 (is_vacation=false/null & visibility=company)')
console.log('========================================================================\n')
let any = false
for (const m of rows) {
  if (m.samples.length === 0) continue
  any = true
  console.log(`● ${m.name} (${m.email})`)
  for (const e of m.samples) {
    const date = e.start_at?.slice(0, 10) ?? ''
    console.log(`    - "${e.title}"  ${date}  is_vacation=${e.is_vacation}  visibility=${e.visibility}  id=${e.id}`)
  }
  console.log()
}
if (!any) console.log('  (해당 이벤트 없음 — 모든 휴가가 정상적으로 is_vacation=true 로 저장됨)')

console.log(`\n총 이벤트 수: ${events.length}`)
