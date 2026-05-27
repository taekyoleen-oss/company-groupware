-- Step 24: 인사기록(cg_hr_records) 개인정보 항목 정리
-- - 추가:  resident_id  (주민등록번호, 평문 text — 표시 시 본인 화면에서 마스킹)
--          hire_position (입사직급)
-- - 제거:  employee_no (사번)
--          birth_date  (생년월일 — 주민번호 앞 6자리로 대체)
-- - 인덱스 idx_hr_records_employee_no 도 함께 제거
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)
--
-- 보안 메모
--   주민등록번호는 개인정보보호법상 민감정보이므로 RLS 로 본인/앱관리자만 SELECT 가능하도록
--   이미 step19 에서 정책이 설정되어 있다. 본 단계에서는 컬럼만 추가하고,
--   본인 응답은 API 레이어에서 마스킹된 형태(880101-1******) 로만 노출한다.

ALTER TABLE cg_hr_records
  ADD COLUMN IF NOT EXISTS resident_id   text,
  ADD COLUMN IF NOT EXISTS hire_position text;

DROP INDEX IF EXISTS idx_hr_records_employee_no;

ALTER TABLE cg_hr_records
  DROP COLUMN IF EXISTS employee_no,
  DROP COLUMN IF EXISTS birth_date;

NOTIFY pgrst, 'reload schema';
