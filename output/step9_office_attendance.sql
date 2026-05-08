-- 사무실 네트워크 IP 화이트리스트
CREATE TABLE IF NOT EXISTS cg_office_networks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr        text        NOT NULL,
  label       text,
  created_by  uuid        REFERENCES cg_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cg_office_networks ENABLE ROW LEVEL SECURITY;

-- 활성 사용자 전체 조회 가능 (서버사이드 IP 매칭에 필요)
CREATE POLICY "office_networks_select_authed"
  ON cg_office_networks FOR SELECT TO authenticated
  USING (true);

-- 관리자만 추가·수정·삭제
CREATE POLICY "office_networks_admin_write"
  ON cg_office_networks FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 출석 방식 컬럼 추가 (gps: GPS 기반, office_login: 사무실 IP 기반)
ALTER TABLE cg_attendance
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'gps'
  CHECK (method IN ('gps', 'office_login'));
