-- 휴가 취소 신청 테이블
CREATE TABLE IF NOT EXISTS cg_vacation_cancel_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES cg_events(id) ON DELETE CASCADE,
  requested_by uuid       NOT NULL REFERENCES cg_profiles(id),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  reason      text,
  reviewed_by uuid        REFERENCES cg_profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cg_vacation_cancel_requests ENABLE ROW LEVEL SECURITY;

-- 본인 취소 신청 생성
CREATE POLICY "Users can create own vacation cancel requests"
  ON cg_vacation_cancel_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- 본인 요청 또는 관리자 조회
CREATE POLICY "Users and admins can view vacation cancel requests"
  ON cg_vacation_cancel_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 관리자만 승인/거부 가능
CREATE POLICY "Admins can update vacation cancel requests"
  ON cg_vacation_cancel_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
