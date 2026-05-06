-- 비밀번호를 'password'로 맞추고, 지정 계정에 관리자(admin) 권한을 부여합니다.
-- Supabase → SQL Editor 에서 한 번에 실행하세요.
--
-- 대상:
-- - teakyoleen@gamil.com → 비밀번호만 (오타로 가입한 경우 대비; 없으면 0건)
-- - taekyoleen@gmail.com → 비밀번호 + 관리자 (기존 step6_fix_admin.sql 과 동일 철자)
-- - test@example.com → 관리자

DO $$
DECLARE
  team_mng uuid;
  pwd_count int;
  admin_count int;
BEGIN
  SELECT id INTO team_mng FROM public.cg_teams WHERE name = '관리부' LIMIT 1;

  UPDATE auth.users
  SET
    encrypted_password = crypt('password', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE email IN (
    'teakyoleen@gamil.com',
    'taekyoleen@gmail.com'
  );
  GET DIAGNOSTICS pwd_count = ROW_COUNT;

  UPDATE public.cg_profiles
  SET
    role = 'admin',
    status = 'active',
    team_id = CASE
      WHEN team_id IS NULL AND team_mng IS NOT NULL THEN team_mng
      ELSE team_id
    END
  WHERE id IN (
    SELECT id FROM auth.users
    WHERE email IN ('taekyoleen@gmail.com', 'test@example.com')
  );
  GET DIAGNOSTICS admin_count = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cg_profiles' AND column_name = 'email'
  ) THEN
    UPDATE public.cg_profiles p
    SET email = u.email
    FROM auth.users u
    WHERE p.id = u.id
      AND p.email IS DISTINCT FROM u.email
      AND u.email IN ('taekyoleen@gmail.com', 'test@example.com');
  END IF;

  RAISE NOTICE '비밀번호 변경(auth.users): % 건', pwd_count;
  RAISE NOTICE '관리자 프로필 갱신(cg_profiles): % 건', admin_count;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'taekyoleen@gmail.com') THEN
    RAISE NOTICE '[확인] taekyoleen@gmail.com 이 없습니다. Authentication에서 실제 로그인 이메일 철자를 확인하세요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'teakyoleen@gamil.com') THEN
    RAISE NOTICE '[참고] teakyoleen@gamil.com 계정이 없습니다. 실제 가입 주소가 다르면 아래 ''직접 수정'' 안내를 보세요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'test@example.com') THEN
    RAISE NOTICE '[확인] test@example.com 이 없습니다. add_super_admin_test_example.sql 로 먼저 생성하세요.';
  END IF;
END;
$$;
