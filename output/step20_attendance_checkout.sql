-- Step 20: cg_attendance.checked_out_at 컬럼 추가 (퇴근 시간)
-- - 본인이 퇴근 확인 버튼을 누를 때 기록.
-- - 미입력 상태로 다음날이 되면 자동 보정 작업(또는 다음 출근 처리 시)에서 18:00(KST)으로 채운다.
--   (서버의 attendance/checkout 라우트가 비어 있는 과거 행을 18:00으로 보정한다.)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

ALTER TABLE cg_attendance
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

COMMENT ON COLUMN cg_attendance.checked_out_at IS
  '퇴근 시각. 본인이 사무실 IP 안에서 퇴근 확인을 누르거나, 미입력 상태로 다음날 처음 접속 시 18:00(KST)로 자동 보정된다.';

NOTIFY pgrst, 'reload schema';
