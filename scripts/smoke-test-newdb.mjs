// 새 DB 스모크 테스트: .env.local의 URL/anon 키로 로그인 + RLS 프로필 조회
// 실행: TEST_EMAIL=... TEST_PASSWORD=... node scripts/smoke-test-newdb.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log('대상:', env.NEXT_PUBLIC_SUPABASE_URL);

const { data, error } = await supabase.auth.signInWithPassword({
  email: process.env.TEST_EMAIL,
  password: process.env.TEST_PASSWORD,
});
if (error) {
  console.error('로그인 실패:', error.message);
  process.exit(1);
}
console.log('로그인 성공:', data.user.email, '/', data.user.id);

const { data: prof, error: pe } = await supabase
  .from('cg_profiles')
  .select('full_name, role, status, is_super_admin')
  .eq('id', data.user.id)
  .single();
if (pe) {
  console.error('프로필 조회 실패:', pe.message);
  process.exit(1);
}
console.log('프로필:', JSON.stringify(prof));

const { count, error: ee } = await supabase
  .from('cg_events')
  .select('*', { count: 'exact', head: true });
if (ee) {
  console.error('이벤트 조회 실패:', ee.message);
  process.exit(1);
}
console.log('로그인 사용자에게 보이는 이벤트 수(RLS 적용):', count);

await supabase.auth.signOut();
console.log('스모크 테스트 통과');
