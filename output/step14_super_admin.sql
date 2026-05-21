  -- Step 14: 앱관리자(super_admin) / 관리자(manager) / 실무자(member) 역할 분리
  --
  -- 목적
  --  - 기존 role='admin' 회원들 중 test@example.com만 "앱관리자(super_admin)"로 유지
  --  - 나머지 admin은 "관리자(manager) = 결재자"로 강등
  --  - 추가 컬럼 is_super_admin 으로 앱관리자 식별을 명시
  --
  -- 적용 위치: Supabase SQL Editor 에서 실행
  --
  -- 실행 후 효과
  --  - test@example.com         → role='admin',   is_super_admin=true
  --  - 기존 다른 admin 회원      → role='manager', is_super_admin=false
  --  - role='admin' 이면서 super=false 인 회원은 존재하지 않게 됨
  --  - 기존 RLS의 current_user_role()='admin' 검사는 자동으로 앱관리자에게만 매칭

  BEGIN;

  -- 1. is_super_admin 컬럼 추가
  ALTER TABLE cg_profiles
    ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

  -- 2. test@example.com만 앱관리자로 표시
  UPDATE cg_profiles
  SET is_super_admin = true,
      role = 'admin'
  WHERE email = 'test@example.com';

  -- 3. test@example.com 이외의 admin 회원은 manager(결재자)로 강등
  UPDATE cg_profiles
  SET role = 'manager'
  WHERE role = 'admin'
    AND COALESCE(email, '') <> 'test@example.com';

  -- 4. 데이터 검증용 보조 함수: 현재 사용자가 앱관리자인지
  CREATE OR REPLACE FUNCTION is_current_super_admin()
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT COALESCE(
      (SELECT is_super_admin FROM cg_profiles WHERE id = auth.uid()),
      false
    );
  $$;

  -- 5. 인덱스 (앱관리자 찾기 단순 조회용)
  CREATE INDEX IF NOT EXISTS idx_cg_profiles_is_super_admin
    ON cg_profiles(is_super_admin)
    WHERE is_super_admin = true;

  -- 6. 신규 가입 트리거 갱신
  --    첫 번째 가입자만 앱관리자(admin + is_super_admin=true) 으로 자동 승격
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

    INSERT INTO public.cg_profiles (id, full_name, color, role, status, is_super_admin, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '사용자'),
      user_color,
      CASE WHEN profile_count = 0 THEN 'admin' ELSE 'member' END,
      CASE WHEN profile_count = 0 THEN 'active'  ELSE 'pending' END,
      CASE WHEN profile_count = 0 THEN true      ELSE false    END,
      NEW.email
    );
    RETURN NEW;
  END;
  $$;

  COMMIT;

  -- ── 검증 쿼리 (수동 실행) ──────────────────────────────────────
  -- SELECT id, full_name, email, role, is_super_admin FROM cg_profiles ORDER BY full_name;
  -- SELECT is_current_super_admin();  -- 현재 로그인 사용자가 앱관리자인지
