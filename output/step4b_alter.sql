-- =====================================================
-- Step 4b: 이미 step4_messages.sql을 실행한 경우에만 실행
-- cg_messages 테이블에 수신자 이름 컬럼 추가
-- =====================================================

ALTER TABLE cg_messages
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS team_name      text;
