-- 이미 생성된 테스트 계정(10명)의 비밀번호를 모두 'password'로 바꿉니다.
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- (step5_test_users.sql 로 만든 계정과 동일한 이메일 목록입니다.)

UPDATE auth.users
SET encrypted_password = crypt('password', gen_salt('bf'))
WHERE email IN (
  'ceo@test.com',
  'mng_leader@test.com',
  'mng1@test.com',
  'mng2@test.com',
  'mng3@test.com',
  'sales_leader@test.com',
  'sales1@test.com',
  'sales2@test.com',
  'sales3@test.com',
  'sales4@test.com'
);
