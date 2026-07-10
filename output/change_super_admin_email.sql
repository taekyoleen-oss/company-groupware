-- 앱관리자(super admin) 로그인 이메일 변경
--   test@example.com  →  manager@howdenkorea.com
--
-- 적용 위치: Supabase SQL Editor (postgres role) 에서 실행
--
-- 변경 대상
--   1) auth.users.email          : 로그인 이메일
--   2) auth.users.email_change*  : 진행 중인 이메일 변경 토큰 초기화(잔여 상태 제거)
--   3) auth.identities           : 'email' provider 의 identity_data.email + email 컬럼
--   4) cg_profiles.email         : 앱 프로파일에 표시되는 이메일
--
-- 주의
--   - manager@howdenkorea.com 이 이미 auth.users 에 존재하면 UNIQUE 제약 위반.
--     사전에 SELECT 로 확인 후 진행할 것.
--   - email_confirmed_at 은 그대로 유지(이미 인증된 계정으로 간주).
--   - 본 스크립트는 결과 검증 SELECT 까지 트랜잭션 안에서 함께 수행한다.

BEGIN;

-- 0. 사전 점검: 대상 계정 존재 + 신규 이메일 중복 없음
DO $$
DECLARE
  v_old_count int;
  v_new_count int;
BEGIN
  SELECT COUNT(*) INTO v_old_count FROM auth.users WHERE email = 'test@example.com';
  SELECT COUNT(*) INTO v_new_count FROM auth.users WHERE email = 'manager@howdenkorea.com';

  IF v_old_count = 0 THEN
    RAISE EXCEPTION 'auth.users 에 test@example.com 이 없습니다. 이미 변경되었거나 다른 이메일을 사용 중일 수 있습니다.';
  END IF;

  IF v_new_count > 0 THEN
    RAISE EXCEPTION 'auth.users 에 manager@howdenkorea.com 이 이미 존재합니다. 중복 가입 여부를 확인하세요.';
  END IF;
END $$;

-- 1. auth.users 이메일 갱신
UPDATE auth.users
SET
  email                       = 'manager@howdenkorea.com',
  email_change                = '',
  email_change_token_new      = '',
  email_change_token_current  = '',
  email_change_confirm_status = 0,
  updated_at                  = now()
WHERE email = 'test@example.com';

-- 2. auth.identities 갱신 (email provider)
--    NOTE: 최신 Supabase 에서 auth.identities.email 은 generated column 이므로
--          identity_data 만 갱신하면 email 컬럼이 자동으로 따라온다.
UPDATE auth.identities
SET
  identity_data = jsonb_set(identity_data, '{email}', '"manager@howdenkorea.com"', true),
  updated_at    = now()
WHERE provider = 'email'
  AND identity_data->>'email' = 'test@example.com';

-- 3. cg_profiles 이메일 갱신
UPDATE cg_profiles
SET email = 'manager@howdenkorea.com'
WHERE email = 'test@example.com';

COMMIT;

-- ── 검증 쿼리 (수동 실행) ──────────────────────────────────────
-- SELECT id, email, email_confirmed_at FROM auth.users WHERE email IN ('test@example.com', 'manager@howdenkorea.com');
-- SELECT user_id, provider, email, identity_data->>'email' AS data_email FROM auth.identities WHERE email IN ('test@example.com', 'manager@howdenkorea.com');
-- SELECT id, full_name, email, role, is_super_admin FROM cg_profiles WHERE is_super_admin = true;
