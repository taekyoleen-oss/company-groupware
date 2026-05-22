-- Step 13: 사무실 IP 화이트리스트 통합
-- - cg_office_networks 테이블이 없으면 생성 (step9의 정의 + last_matched_at 컬럼 포함)
-- - cg_office_networks 에 last_matched_at 컬럼이 없으면 추가
-- - 기존 cg_company_settings.office_ips (쉼표 문자열) 값을 cg_office_networks 행으로 이관
-- - office_ips 컬럼은 일단 유지(호환). 모든 코드가 cg_office_networks 기반으로 동작하는 것을 확인한 후 제거 권장.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

CREATE TABLE IF NOT EXISTS cg_office_networks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr            text        NOT NULL,
  label           text,
  last_matched_at timestamptz,
  created_by      uuid        REFERENCES cg_profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cg_office_networks
  ADD COLUMN IF NOT EXISTS last_matched_at timestamptz;

ALTER TABLE cg_office_networks ENABLE ROW LEVEL SECURITY;

-- 활성 사용자 전체 조회 가능 (서버사이드 IP 매칭에 필요)
DROP POLICY IF EXISTS "office_networks_select_authed" ON cg_office_networks;
CREATE POLICY "office_networks_select_authed"
  ON cg_office_networks FOR SELECT TO authenticated
  USING (true);

-- 관리자만 추가·수정·삭제
DROP POLICY IF EXISTS "office_networks_admin_write" ON cg_office_networks;
CREATE POLICY "office_networks_admin_write"
  ON cg_office_networks FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- cg_company_settings.office_ips 콤마값을 cg_office_networks 로 이관
DO $$
DECLARE
  raw_ip text;
  trimmed text;
  cidr_value text;
BEGIN
  FOR raw_ip IN
    SELECT regexp_split_to_table(office_ips, ',')
    FROM cg_company_settings
    WHERE office_ips IS NOT NULL AND length(trim(office_ips)) > 0
  LOOP
    trimmed := trim(raw_ip);
    CONTINUE WHEN trimmed = '';

    cidr_value := CASE
      WHEN position('/' IN trimmed) > 0 THEN trimmed
      ELSE trimmed || '/32'
    END;

    IF NOT EXISTS (SELECT 1 FROM cg_office_networks WHERE cidr = cidr_value) THEN
      INSERT INTO cg_office_networks (cidr, label) VALUES (cidr_value, '기존 등록');
    END IF;
  END LOOP;
END $$;
