-- Step 15: cg_attendance / cg_office_devices 실시간 구독 활성화
-- 관리자 패널에서 출근 기록·PC 등록 요청을 실시간으로 받아보기 위해
-- Supabase realtime publication 에 두 테이블을 추가.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 이미 등록되어 있으면 스킵)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cg_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cg_attendance;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cg_office_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cg_office_devices;
  END IF;
END $$;
