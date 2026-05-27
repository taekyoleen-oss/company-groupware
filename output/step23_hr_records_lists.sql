-- Step 23: 인사기록(cg_hr_records)에 학력/경력/자격증 JSONB 배열 컬럼 추가
-- - education    : string[] (최대 3행, 한 줄 자유 입력)
-- - career       : string[] (최대 5행, 한 줄 자유 입력)
-- - certificates : string[] (최대 5행, 한 줄 자유 입력)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

ALTER TABLE cg_hr_records
  ADD COLUMN IF NOT EXISTS education    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS career       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certificates jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 항목 개수 상한 + 모든 원소가 text 인지 검증
ALTER TABLE cg_hr_records
  DROP CONSTRAINT IF EXISTS cg_hr_records_education_chk;
ALTER TABLE cg_hr_records
  ADD CONSTRAINT cg_hr_records_education_chk
  CHECK (
    jsonb_typeof(education) = 'array'
    AND jsonb_array_length(education) <= 3
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(education) e WHERE jsonb_typeof(e) <> 'string'
    )
  );

ALTER TABLE cg_hr_records
  DROP CONSTRAINT IF EXISTS cg_hr_records_career_chk;
ALTER TABLE cg_hr_records
  ADD CONSTRAINT cg_hr_records_career_chk
  CHECK (
    jsonb_typeof(career) = 'array'
    AND jsonb_array_length(career) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(career) e WHERE jsonb_typeof(e) <> 'string'
    )
  );

ALTER TABLE cg_hr_records
  DROP CONSTRAINT IF EXISTS cg_hr_records_certificates_chk;
ALTER TABLE cg_hr_records
  ADD CONSTRAINT cg_hr_records_certificates_chk
  CHECK (
    jsonb_typeof(certificates) = 'array'
    AND jsonb_array_length(certificates) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(certificates) e WHERE jsonb_typeof(e) <> 'string'
    )
  );

NOTIFY pgrst, 'reload schema';
