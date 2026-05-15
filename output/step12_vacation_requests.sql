-- Step 12: 휴가 신청(결재 필요) 흐름
-- - cg_vacation_requests 테이블: 신청자 ≠ 결재자인 경우 pending 상태로 저장
-- - 결재자가 승인하면 cg_events에 휴가 일정 생성 + status='approved'
-- - 거부 시 status='rejected', 이벤트는 생성되지 않음

BEGIN;

CREATE TABLE IF NOT EXISTS cg_vacation_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by  uuid        NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  approver_id   uuid        REFERENCES cg_profiles(id) ON DELETE SET NULL,
  title         text        NOT NULL,
  description   text,
  start_at      timestamptz NOT NULL,
  end_at        timestamptz NOT NULL,
  is_all_day    boolean     NOT NULL DEFAULT true,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  event_id      uuid        REFERENCES cg_events(id) ON DELETE SET NULL,
  reject_reason text,
  reviewed_by   uuid        REFERENCES cg_profiles(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cg_vacation_requests_requested_by
  ON cg_vacation_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_cg_vacation_requests_approver_id
  ON cg_vacation_requests(approver_id);
CREATE INDEX IF NOT EXISTS idx_cg_vacation_requests_status
  ON cg_vacation_requests(status);

ALTER TABLE cg_vacation_requests ENABLE ROW LEVEL SECURITY;

-- 본인 신청 생성
DROP POLICY IF EXISTS "vac_req_self_insert" ON cg_vacation_requests;
CREATE POLICY "vac_req_self_insert"
  ON cg_vacation_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- 본인이 신청한 건 + 관리자 + 지정 결재자 조회
DROP POLICY IF EXISTS "vac_req_select" ON cg_vacation_requests;
CREATE POLICY "vac_req_select"
  ON cg_vacation_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 본인이 pending 상태에서 철회(DELETE)
DROP POLICY IF EXISTS "vac_req_self_withdraw" ON cg_vacation_requests;
CREATE POLICY "vac_req_self_withdraw"
  ON cg_vacation_requests FOR DELETE TO authenticated
  USING (
    requested_by = auth.uid()
    AND status = 'pending'
  );

-- 관리자 + 지정 결재자 UPDATE
DROP POLICY IF EXISTS "vac_req_approver_update" ON cg_vacation_requests;
CREATE POLICY "vac_req_approver_update"
  ON cg_vacation_requests FOR UPDATE TO authenticated
  USING (
    approver_id = auth.uid()
    OR (
      approver_id IS NULL
      AND EXISTS (
        SELECT 1 FROM cg_profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

COMMIT;
