-- 휴가 취소 신청 이력 보존 마이그레이션
-- 목적: 관리자가 승인한 휴가 취소 내역을 DB에 영구 기록으로 남긴다.
-- 변경:
--   1) 이벤트 삭제 시 신청 row가 함께 사라지지 않도록 FK를 ON DELETE SET NULL 로 전환
--   2) 삭제된 이벤트의 정보를 복원할 수 있도록 스냅샷 컬럼 추가
--   3) reviewed_at 기본값(승인/거부 시점) 가독성을 위해 인덱스 추가

-- 1) event_id NOT NULL 제약 해제 + FK 재정의
ALTER TABLE cg_vacation_cancel_requests
  ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE cg_vacation_cancel_requests
  DROP CONSTRAINT IF EXISTS cg_vacation_cancel_requests_event_id_fkey;

ALTER TABLE cg_vacation_cancel_requests
  ADD CONSTRAINT cg_vacation_cancel_requests_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES cg_events(id) ON DELETE SET NULL;

-- 2) 이벤트 스냅샷 컬럼
ALTER TABLE cg_vacation_cancel_requests
  ADD COLUMN IF NOT EXISTS event_title      text,
  ADD COLUMN IF NOT EXISTS event_start_at   timestamptz,
  ADD COLUMN IF NOT EXISTS event_end_at     timestamptz,
  ADD COLUMN IF NOT EXISTS event_is_all_day boolean;

-- 3) 이력 조회 최적화용 인덱스
CREATE INDEX IF NOT EXISTS cg_vacation_cancel_requests_status_created_at_idx
  ON cg_vacation_cancel_requests (status, created_at DESC);
