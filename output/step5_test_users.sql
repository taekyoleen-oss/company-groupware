-- 10명의 테스트 유저(영업부 5명, 관리부 5명)를 생성하는 SQL 스크립트입니다.
-- Supabase 대시보드의 SQL Editor에 복사하여 붙여넣고 실행(Run)하세요.
-- 모든 유저의 기본 비밀번호는 'password123!' 입니다.

DO $$
DECLARE
  -- 팀 ID 변수
  team_sales uuid := gen_random_uuid();
  team_mng uuid := gen_random_uuid();
  
  -- CEO
  uid_ceo uuid := gen_random_uuid();
  
  -- 영업부 인원 (5명)
  uid_sales_leader uuid := gen_random_uuid();
  uid_sales_1 uuid := gen_random_uuid();
  uid_sales_2 uuid := gen_random_uuid();
  uid_sales_3 uuid := gen_random_uuid();
  uid_sales_4 uuid := gen_random_uuid();

  -- 관리부 인원 (4명 + CEO=5명)
  uid_mng_leader uuid := gen_random_uuid();
  uid_mng_1 uuid := gen_random_uuid();
  uid_mng_2 uuid := gen_random_uuid();
  uid_mng_3 uuid := gen_random_uuid();

BEGIN
  -- 1. 팀 생성
  INSERT INTO public.cg_teams (id, name) VALUES 
    (team_sales, '영업부'),
    (team_mng, '관리부');

  -- 2. auth.users 에 가상 유저 10명 삽입
  -- 비밀번호는 모두 'password123!'
  
  -- [CEO]
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (uid_ceo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ceo@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"대표이사"}', now(), now());

  -- [관리부]
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (uid_mng_leader, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mng_leader@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"관리부장"}', now(), now()),
    (uid_mng_1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mng1@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"관리직원1"}', now(), now()),
    (uid_mng_2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mng2@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"관리직원2"}', now(), now()),
    (uid_mng_3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mng3@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"관리직원3"}', now(), now());

  -- [영업부]
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (uid_sales_leader, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales_leader@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"영업부장"}', now(), now()),
    (uid_sales_1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales1@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"영업직원1"}', now(), now()),
    (uid_sales_2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales2@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"영업직원2"}', now(), now()),
    (uid_sales_3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales3@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"영업직원3"}', now(), now()),
    (uid_sales_4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales4@test.com', crypt('password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"영업직원4"}', now(), now());

  -- 3. 트리거로 인해 자동 생성된 profiles 업데이트 (부서, 역할, active 상태 승인)
  
  -- CEO (관리부, admin 부여 가능하지만 요청에 따라 대표이므로 최고권한부여)
  UPDATE public.cg_profiles 
  SET team_id = team_mng, role = 'admin', status = 'active'
  WHERE id = uid_ceo;

  -- 관리부
  UPDATE public.cg_profiles SET team_id = team_mng, role = 'manager', status = 'active' WHERE id = uid_mng_leader;
  UPDATE public.cg_profiles SET team_id = team_mng, role = 'member', status = 'active' WHERE id IN (uid_mng_1, uid_mng_2, uid_mng_3);

  -- 영업부
  UPDATE public.cg_profiles SET team_id = team_sales, role = 'manager', status = 'active' WHERE id = uid_sales_leader;
  UPDATE public.cg_profiles SET team_id = team_sales, role = 'member', status = 'active' WHERE id IN (uid_sales_1, uid_sales_2, uid_sales_3, uid_sales_4);

END;
$$;
