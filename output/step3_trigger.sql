-- 신규 Auth 사용자 생성 시 자동으로 cg_profiles 레코드 생성하는 트리거
-- 첫 번째 사용자 → admin + active
-- 이후 사용자 → member + pending

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

  INSERT INTO public.cg_profiles (id, full_name, color, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '사용자'),
    user_color,
    CASE WHEN profile_count = 0 THEN 'admin' ELSE 'member' END,
    CASE WHEN profile_count = 0 THEN 'active'  ELSE 'pending' END
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
