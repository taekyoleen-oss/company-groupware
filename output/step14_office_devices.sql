-- Step 14: 사무실 PC(디바이스) 등록 & 관리자 승인 체계
-- - cg_office_devices 테이블 생성 (user_id, user_agent, last_ip, device_label, status, ...)
-- - cg_company_settings.require_device_approval 컬럼 추가
-- - RLS: 본인은 자기 행만, 관리자는 전체 가능
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

------------------------------------------------------------
-- 1) cg_office_devices 테이블
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cg_office_devices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  user_agent      text        NOT NULL,
  last_ip         text,
  device_label    text,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  decided_by      uuid        REFERENCES cg_profiles(id),
  last_used_at    timestamptz,
  UNIQUE (user_id, user_agent)
);

CREATE INDEX IF NOT EXISTS idx_office_devices_user
  ON cg_office_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_office_devices_status
  ON cg_office_devices(status);

ALTER TABLE cg_office_devices ENABLE ROW LEVEL SECURITY;

-- 본인은 자신의 디바이스 조회 가능
DROP POLICY IF EXISTS "office_devices_select_own" ON cg_office_devices;
CREATE POLICY "office_devices_select_own"
  ON cg_office_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 본인은 자신의 디바이스 등록 가능 (status='pending' 기본)
DROP POLICY IF EXISTS "office_devices_insert_own" ON cg_office_devices;
CREATE POLICY "office_devices_insert_own"
  ON cg_office_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인은 자신의 디바이스 라벨/IP 갱신 가능 (status·decided_* 변경 불가는 서버 라우트에서 통제)
DROP POLICY IF EXISTS "office_devices_update_own" ON cg_office_devices;
CREATE POLICY "office_devices_update_own"
  ON cg_office_devices FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 본인은 자신의 디바이스 삭제 가능
DROP POLICY IF EXISTS "office_devices_delete_own" ON cg_office_devices;
CREATE POLICY "office_devices_delete_own"
  ON cg_office_devices FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 앱관리자는 전체 조회/수정/삭제 가능
DROP POLICY IF EXISTS "office_devices_admin_all" ON cg_office_devices;
CREATE POLICY "office_devices_admin_all"
  ON cg_office_devices FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid()
        AND (is_super_admin = true OR role = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid()
        AND (is_super_admin = true OR role = 'admin')
    )
  );

------------------------------------------------------------
-- 2) cg_company_settings.require_device_approval
------------------------------------------------------------
ALTER TABLE cg_company_settings
  ADD COLUMN IF NOT EXISTS require_device_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cg_company_settings.require_device_approval IS
  'true 면 사무실 IP 매칭 + 관리자 승인된 PC만 출근 체크 허용. false 면 IP 매칭만으로 허용.';
