-- Step 17: cg_attendance.method 컬럼 (현장에서 누락되어 있던 step9 보완)
-- - method: 'gps' (legacy) | 'office_login' (사무실 IP) — 출근 방식 추적
-- - 누락된 환경에서도 안전하게 실행 가능 (IF NOT EXISTS)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

ALTER TABLE cg_attendance
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'office_login'
  CHECK (method IN ('gps', 'office_login'));

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
