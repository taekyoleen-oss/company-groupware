-- Step 23: 인사기록(cg_hr_records)에 학력/경력/자격증 JSONB 배열 컬럼 추가
-- - education    : string[] (최대 3행, 한 줄 자유 입력)
-- - career       : string[] (최대 5행, 한 줄 자유 입력)
-- - certificates : string[] (최대 5행, 한 줄 자유 입력)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)
--
-- 설계 메모
--   - CHECK 제약은 서브쿼리를 쓸 수 없으므로(Postgres 표준)
--     "배열 타입 + 길이 상한"만 DB 레벨에서 강제한다.
--   - 원소 타입(string) 검증은 API 레이어(/api/admin/hr-records/[userId]) 에서
--     trim + 빈 문자열 제거 + slice 로 처리한다.

ALTER TABLE cg_hr_records
  ADD COLUMN IF NOT EXISTS education    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS career       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certificates jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cg_hr_records
  DROP CONSTRAINT IF EXISTS cg_hr_records_education_chk;
ALTER TABLE cg_hr_records
  ADD CONSTRAINT cg_hr_records_education_chk
  CHECK (
    jsonb_typeof(education) = 'array'
    AND jsonb_array_length(education) <= 3
  );

ALTER TABLE cg_hr_records
  DROP CONSTRAINT IF EXISTS cg_hr_records_career_chk;
ALTER TABLE cg_hr_records
  ADD CONSTRAINT cg_hr_records_career_chk
  CHECK (
    jsonb_typeof(career) = 'array'
    AND jsonb_array_length(career) <= 5
  );

ALTER TABLE cg_hr_records
  DROP CONSTRAINT IF EXISTS cg_hr_records_certificates_chk;
ALTER TABLE cg_hr_records
  ADD CONSTRAINT cg_hr_records_certificates_chk
  CHECK (
    jsonb_typeof(certificates) = 'array'
    AND jsonb_array_length(certificates) <= 5
  );

NOTIFY pgrst, 'reload schema';
