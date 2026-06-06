-- Step 26: 개발자 전용 웹마스터 계정 생성 (test@example.com / password)
--
-- 목적
--  - 앱 수정·개발 전용 슈퍼관리자 계정을 만들되,
--    회원 명단 / 출근 / 휴가 / 메시지 수신자 / 팀원 목록 어디에도 노출되지 않게 한다.
--  - 출근·휴가 관리 목록은 이미 is_super_admin 계정을 제외하므로,
--    추가로 is_hidden 플래그를 도입해 "회원 명단/수신자 목록"에서도 숨긴다.
--
-- 적용 위치: Supabase SQL Editor (postgres role) 에서 실행
--
-- 실행 후 효과
--  - test@example.com : role='admin', is_super_admin=true, is_hidden=true,
--                       status='active', team_id=NULL, 비밀번호 'password'
--  - 회원 명단/메시지 수신자/팀원 목록 쿼리는 is_hidden=true 를 제외 (앱 코드와 함께 동작)

BEGIN;

-- 1. is_hidden 컬럼 추가 (회원 명단 등에서 숨길 대상 표시)
ALTER TABLE public.cg_profiles
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- 2. 계정 생성 / 보정
DO $$
DECLARE
  new_id   uuid := gen_random_uuid();
  existing uuid;
BEGIN
  SELECT id INTO existing FROM auth.users WHERE email = 'test@example.com' LIMIT 1;

  IF existing IS NULL THEN
    -- auth.users 신규 삽입 → handle_new_user 트리거가 cg_profiles 행을 만든다
    -- NOTE: GoTrue 가 문자열로 스캔하는 토큰 계열 컬럼은 반드시 '' 로 채운다.
    --       NULL 로 두면 로그인 시 "Database error querying schema" 500 발생.
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      email_change_confirm_status
    )
    VALUES (
      new_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'test@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"웹마스터(개발자)"}',
      now(),
      now(),
      '', '', '', '', '', '', '', '', 0
    );
    existing := new_id;

    -- email provider identity (로그인에 필요)
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (
      new_id::text, new_id,
      jsonb_build_object('sub', new_id::text, 'email', 'test@example.com', 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  ELSE
    -- 이미 있으면 비밀번호·인증 상태만 맞춤
    UPDATE auth.users
    SET encrypted_password = crypt('password', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at         = now()
    WHERE id = existing;
  END IF;

  -- 트리거가 행을 못 만든 환경(또는 기존 행) 안전 보정: 프로필 행 보장
  INSERT INTO public.cg_profiles (id, full_name, color, role, status, is_super_admin, is_hidden, email)
  VALUES (existing, '웹마스터(개발자)', '#64748B', 'admin', 'active', true, true, 'test@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- 개발자 전용 웹마스터로 확정 설정
  UPDATE public.cg_profiles
  SET full_name      = '웹마스터(개발자)',
      role           = 'admin',
      is_super_admin = true,
      is_hidden      = true,
      status         = 'active',
      team_id        = NULL,
      email          = 'test@example.com'
  WHERE id = existing;

  RAISE NOTICE 'test@example.com 웹마스터(개발자) 준비 완료 — admin/super_admin/hidden, 비밀번호: password';
END $$;

COMMIT;

-- ── 검증 쿼리 (수동 실행) ──────────────────────────────────────
-- SELECT id, full_name, email, role, is_super_admin, is_hidden, status, team_id
--   FROM public.cg_profiles WHERE email = 'test@example.com';
-- 회원 명단에 안 잡히는지: 앱의 회원 관리 화면에서 'test@example.com' 미표시 확인
