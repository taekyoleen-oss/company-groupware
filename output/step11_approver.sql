-- Step 11: 휴가 결재자(approver) 기능
-- - cg_profiles에 approver_id 컬럼 추가 (NULL = 관리자가 결재)
-- - RLS: 결재자가 본인 결재 직원의 할당량(총휴가) 변경 가능
-- - RLS: 결재자가 본인 결재 직원의 휴가 취소요청 조회/처리 가능

BEGIN;

-- 1. 결재자 컬럼 추가 (self-ref, ON DELETE SET NULL → 결재자 삭제 시 관리자 결재로 자동 복귀)
ALTER TABLE cg_profiles
  ADD COLUMN IF NOT EXISTS approver_id uuid
  REFERENCES cg_profiles(id) ON DELETE SET NULL;

-- 자기 자신을 결재자로 지정하는 것 방지
ALTER TABLE cg_profiles
  DROP CONSTRAINT IF EXISTS cg_profiles_approver_not_self;
ALTER TABLE cg_profiles
  ADD CONSTRAINT cg_profiles_approver_not_self
  CHECK (approver_id IS NULL OR approver_id <> id);

-- 조회 성능: 결재자 기준 직원 목록 조회용
CREATE INDEX IF NOT EXISTS idx_cg_profiles_approver_id
  ON cg_profiles(approver_id);

-- 2. cg_vacation_allocations RLS — 결재자 UPDATE/INSERT 허용
--    (기존: 본인 SELECT + 관리자 ALL)

DROP POLICY IF EXISTS "vacation_alloc_approver_write" ON cg_vacation_allocations;
CREATE POLICY "vacation_alloc_approver_write"
  ON cg_vacation_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_vacation_allocations.user_id
        AND p.approver_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_vacation_allocations.user_id
        AND p.approver_id = auth.uid()
    )
  );

-- 결재자가 본인이 결재하는 직원 할당량 SELECT 가능 (위 ALL 정책에 SELECT 포함되지만 명확화)
DROP POLICY IF EXISTS "vacation_alloc_approver_select" ON cg_vacation_allocations;
CREATE POLICY "vacation_alloc_approver_select"
  ON cg_vacation_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_vacation_allocations.user_id
        AND p.approver_id = auth.uid()
    )
  );

-- 3. cg_vacation_cancel_requests RLS — 결재자 권한
--    (기존: 본인 INSERT, 본인+관리자 SELECT, 관리자 UPDATE)

-- 결재자가 본인 결재 직원의 취소요청 SELECT
DROP POLICY IF EXISTS "vacation_cancel_approver_select" ON cg_vacation_cancel_requests;
CREATE POLICY "vacation_cancel_approver_select"
  ON cg_vacation_cancel_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_vacation_cancel_requests.requested_by
        AND p.approver_id = auth.uid()
    )
  );

-- 결재자가 본인 결재 직원의 취소요청 UPDATE (승인/거부)
DROP POLICY IF EXISTS "vacation_cancel_approver_update" ON cg_vacation_cancel_requests;
CREATE POLICY "vacation_cancel_approver_update"
  ON cg_vacation_cancel_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_vacation_cancel_requests.requested_by
        AND p.approver_id = auth.uid()
    )
  );

-- 4. 결재자가 본인 결재 직원의 휴가 이벤트(cg_events) 삭제 가능
--    — 취소 승인 시 휴가 일정 삭제 동작 필요. 이벤트 삭제 RLS 확인.
--    (기존 cg_events RLS는 본인+관리자 위주. 결재자가 삭제할 수 있어야 한다.)

DROP POLICY IF EXISTS "events_vacation_approver_delete" ON cg_events;
CREATE POLICY "events_vacation_approver_delete"
  ON cg_events FOR DELETE TO authenticated
  USING (
    is_vacation = true
    AND EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_events.created_by
        AND p.approver_id = auth.uid()
    )
  );

COMMIT;

-- ── 검증 쿼리 (수동 실행) ──────────────────────────────────────
-- SELECT id, full_name, role, approver_id FROM cg_profiles ORDER BY full_name;
-- SELECT policyname, cmd FROM pg_policies
--   WHERE tablename IN ('cg_vacation_allocations', 'cg_vacation_cancel_requests', 'cg_events')
--   ORDER BY tablename, policyname;
