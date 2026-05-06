-- test@example.com 슈퍼관리자 계정 추가 (관리부 / admin, 비밀번호 password)
-- 이미 step5 등으로 팀·유저가 있는 DB에서 실행합니다. Supabase SQL Editor.
-- - 해당 이메일이 없으면 auth.users 삽입 후 트리거로 프로필 생성 → 관리부·admin으로 수정
-- - 이미 있으면 비밀번호·프로필만 맞춥니다.

DO $$
DECLARE
  team_mng uuid;
  new_id uuid := gen_random_uuid();
  existing uuid;
BEGIN
  SELECT id INTO team_mng FROM public.cg_teams WHERE name = '관리부' LIMIT 1;

  IF team_mng IS NULL THEN
    RAISE EXCEPTION '관리부(cg_teams.name = ''관리부'')가 없습니다. 먼저 팀/시드 데이터를 준비하세요.';
  END IF;

  SELECT id INTO existing FROM auth.users WHERE email = 'test@example.com' LIMIT 1;

  IF existing IS NULL THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
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
      '{"full_name":"슈퍼관리자"}',
      now(),
      now()
    );
    existing := new_id;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('password', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = existing;
  END IF;

  UPDATE public.cg_profiles
  SET
    team_id = team_mng,
    role = 'admin',
    status = 'active',
    full_name = '슈퍼관리자'
  WHERE id = existing;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cg_profiles' AND column_name = 'email'
  ) THEN
    UPDATE public.cg_profiles SET email = 'test@example.com' WHERE id = existing;
  END IF;

  RAISE NOTICE 'test@example.com 준비 완료 (관리부, admin, 비밀번호: password)';
END;
$$;
