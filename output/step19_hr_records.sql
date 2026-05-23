-- Step 19: 직원 인사기록(cg_hr_records) 테이블
-- - 1 user = 1 row (user_id PRIMARY KEY)
-- - 앱관리자(super_admin)만 입력/수정/제거 가능
-- - 본인은 자기 인사기록 조회 가능 (편집 불가)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

------------------------------------------------------------
-- 1) cg_hr_records 테이블
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cg_hr_records (
  user_id            uuid        PRIMARY KEY REFERENCES cg_profiles(id) ON DELETE CASCADE,
  hire_date          date,
  employee_no        text,
  birth_date         date,
  phone              text,
  emergency_contact  text,
  address            text,
  notes              text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid        REFERENCES cg_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_records_employee_no
  ON cg_hr_records(employee_no);

ALTER TABLE cg_hr_records ENABLE ROW LEVEL SECURITY;

-- 본인은 자기 인사기록 조회 가능
DROP POLICY IF EXISTS "hr_records_select_own" ON cg_hr_records;
CREATE POLICY "hr_records_select_own"
  ON cg_hr_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 앱관리자는 전체 조회/입력/수정/삭제 가능
DROP POLICY IF EXISTS "hr_records_admin_all" ON cg_hr_records;
CREATE POLICY "hr_records_admin_all"
  ON cg_hr_records FOR ALL TO authenticated
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

NOTIFY pgrst, 'reload schema';
