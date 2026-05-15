-- 모든 일정 및 휴가 데이터 정리
-- 실행 위치: Supabase Dashboard > SQL Editor
-- 주의: 되돌릴 수 없습니다. 실행 전 백업 권장.

BEGIN;

-- 1) 휴가 취소 신청 내역 전체 삭제
--    (cg_events ON DELETE CASCADE로 어차피 삭제되지만 명시적으로 먼저 비운다)
DELETE FROM cg_vacation_cancel_requests;

-- 2) 모든 일정 삭제 (휴가 일정 포함 — is_vacation=true도 함께 제거)
DELETE FROM cg_events;

-- 결과 확인
SELECT 'cg_events' AS table_name, COUNT(*) AS remaining FROM cg_events
UNION ALL
SELECT 'cg_vacation_cancel_requests', COUNT(*) FROM cg_vacation_cancel_requests;

COMMIT;
