-- 관리자 패널에서 이메일 주소를 보여주기 위해 cg_profiles 테이블에 email 컬럼을 추가하고,
-- 기존 회원들의 이메일 정보를 업데이트하며 앞으로 가입하는 회원의 이메일도 자동으로 저장하는 스크립트입니다.
-- Supabase 대시보드의 SQL Editor에 복사하여 붙여넣고 실행(Run)하세요.

-- 1. cg_profiles 테이블에 email 컬럼 추가
ALTER TABLE public.cg_profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. 이미 존재하는 회원들의 이메일 정보를 auth.users에서 가져와서 채워넣기(Backfill)
UPDATE public.cg_profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 3. 회원가입 시 자동으로 프로필을 생성하는 트리거(Trigger) 함수 수정
--    (이제 email 정보도 함께 저장하도록 변경)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  profile_count integer;
  user_color    text;
  palette       text[] := ARRAY[
    '#EF4444', '#F97316', '#EAB308', '#22C55E',
    '#10B981', '#14B8A6', '#3B82F6', '#6366F1',
    '#8B5CF6', '#EC4899', '#F43F5E', '#64748B'
  ];
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.cg_profiles;
  user_color := palette[(profile_count % 12) + 1];

  INSERT INTO public.cg_profiles (id, full_name, email, color, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '사용자'),
    NEW.email,
    user_color,
    CASE WHEN profile_count = 0 THEN 'admin' ELSE 'member' END,
    CASE WHEN profile_count = 0 THEN 'active'  ELSE 'pending' END
  );
  RETURN NEW;
END;
$$;
