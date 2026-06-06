-- Step 26b: step26 로 만든 test@example.com 계정의 로그인 불가 복구
--
-- 증상
--   - cg_profiles 행은 정상 생성되었으나 로그인 시 500
--     ("Database error querying schema" / "Database error loading user")
--   - admin API 로 조회·삭제조차 실패
--
-- 원인
--   - auth.users 에 SQL 로 직접 INSERT 하면서 GoTrue 가 문자열(string)로 스캔하는
--     토큰 계열 컬럼들이 NULL 로 남음 → 인증 처리 중 NULL→string 스캔 실패
--   - email provider 의 auth.identities 행 누락 가능성
--
-- 처리
--   1) 토큰 계열 NULL 컬럼을 '' 로 정규화
--   2) email identity 행 보장 (없으면 생성)
--
-- 적용 위치: Supabase SQL Editor (postgres role) 에서 실행

BEGIN;

-- 1. 토큰 계열 NULL → '' 정규화 (GoTrue 스캔 오류 해소)
UPDATE auth.users
SET
  confirmation_token          = COALESCE(confirmation_token, ''),
  recovery_token              = COALESCE(recovery_token, ''),
  email_change                = COALESCE(email_change, ''),
  email_change_token_new      = COALESCE(email_change_token_new, ''),
  email_change_token_current  = COALESCE(email_change_token_current, ''),
  phone_change                = COALESCE(phone_change, ''),
  phone_change_token          = COALESCE(phone_change_token, ''),
  reauthentication_token      = COALESCE(reauthentication_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  email_confirmed_at          = COALESCE(email_confirmed_at, now()),
  aud                         = COALESCE(NULLIF(aud, ''), 'authenticated'),
  role                        = COALESCE(NULLIF(role, ''), 'authenticated'),
  updated_at                  = now()
WHERE email = 'test@example.com';

-- 2. email provider identity 보장
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email',
  now(), now(), now()
FROM auth.users u
WHERE u.email = 'test@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );

COMMIT;

-- ── 검증 쿼리 (수동 실행) ──────────────────────────────────────
-- SELECT id, email, email_confirmed_at, confirmation_token IS NULL AS conf_null
--   FROM auth.users WHERE email = 'test@example.com';
-- SELECT provider, identity_data->>'email' FROM auth.identities
--   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'test@example.com');
