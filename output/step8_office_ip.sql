-- Step 8: 사무실 IP 기반 출석 체크 방식 추가
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE cg_company_settings
  ADD COLUMN IF NOT EXISTS attendance_method text NOT NULL DEFAULT 'gps'
    CHECK (attendance_method IN ('gps', 'ip')),
  ADD COLUMN IF NOT EXISTS office_ips text;
