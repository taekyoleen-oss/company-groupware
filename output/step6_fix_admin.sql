-- taekyoleen@gmail.com 계정을 강제로 최고 관리자(Admin) 및 활성(Active) 상태로 변경하고,
-- 비밀번호를 'password123!'으로 초기화하는 스크립트입니다.
-- Supabase 대시보드(SQL Editor)에서 실행하세요.

DO $$
DECLARE
  target_email text := 'taekyoleen@gmail.com';
  target_user_id uuid;
BEGIN
  -- 1. 해당 이메일의 유저 ID 찾기
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

  IF target_user_id IS NOT NULL THEN
    -- 2. 비밀번호를 'password123!' 로 초기화 및 이메일 인증 처리
    UPDATE auth.users 
    SET encrypted_password = crypt('password123!', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = target_user_id;

    -- 3. 프로필을 강제로 admin + active 상태로 변경
    UPDATE public.cg_profiles
    SET role = 'admin', status = 'active'
    WHERE id = target_user_id;

    RAISE NOTICE '성공적으로 % 계정이 관리자로 초기화 및 활성화되었습니다. (비밀번호: password123!)', target_email;
  ELSE
    RAISE NOTICE '해당 이메일(%)로 가입된 회원이 없습니다! 먼저 회원가입 페이지에서 가입을 진행해주세요.', target_email;
  END IF;
END;
$$;
