-- Step 4: 회사 설정 및 출석 관리

-- 1. 회사 설정 테이블 (싱글턴)
CREATE TABLE IF NOT EXISTS cg_company_settings (
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
address text NOT NULL DEFAULT '',
latitude double precision,
longitude double precision,
radius_meters integer NOT NULL DEFAULT 200,
updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 기본 행 삽입 (없을 때만)
INSERT INTO cg_company_settings (address)
SELECT '' WHERE NOT EXISTS (SELECT 1 FROM cg_company_settings);

ALTER TABLE cg_company_settings ENABLE ROW LEVEL SECURITY;

-- 활성 사용자 읽기 허용
CREATE POLICY "settings_read_active"
ON cg_company_settings FOR SELECT
USING (EXISTS (
  SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND status = 'active'
));

-- 관리자 전체 권한
CREATE POLICY "settings_write_admin"
ON cg_company_settings FOR ALL
USING (EXISTS (
  SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
));

-- 2. 출석 테이블
CREATE TABLE IF NOT EXISTS cg_attendance (
id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
user_id uuid NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
date date NOT NULL,
checked_in_at timestamptz NOT NULL DEFAULT NOW(),
UNIQUE(user_id, date)
);

ALTER TABLE cg_attendance ENABLE ROW LEVEL SECURITY;

-- 본인 조회
CREATE POLICY "attendance_select_self"
ON cg_attendance FOR SELECT
USING (user_id = auth.uid());

-- 관리자 전체 조회
CREATE POLICY "attendance_select_admin"
ON cg_attendance FOR SELECT
USING (EXISTS (
  SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
));

-- 본인 출석 등록
CREATE POLICY "attendance_insert_self"
ON cg_attendance FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND status = 'active')
);
