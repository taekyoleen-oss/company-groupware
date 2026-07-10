-- Step 30: 휴가 결재 정합성 — 트랜잭션화(RPC) + 직접 삭제 우회 차단
--
-- 배경
--   현재 휴가 승인/취소 결재는 "이벤트 생성/삭제 + 신청 상태 갱신"을 여러 문장으로 나눠 실행한다.
--   원자성이 없어 아래 두 결함이 존재한다.
--     (1) 동시 승인 이중 차감: 두 결재자(또는 더블클릭)가 같은 pending 신청을 동시에 승인하면
--         status='pending' 가드를 둘 다 통과 → cg_events 가 2건 생성 → 사용일수가 2배로 차감된다.
--     (2) 결재 우회(직접 삭제): 확정 휴가 이벤트는 created_by=본인 이므로 RLS/DELETE API 로
--         본인이 직접 삭제 가능 → 취소 결재 없이 사용일수가 되돌아간다.
--
--   이 마이그레이션은
--     · 승인/취소 승인을 SECURITY DEFINER RPC 로 감싸 행(row) 잠금 + 단일 트랜잭션으로 처리하고,
--     · RPC 실행 권한을 service_role 로 제한(브라우저 직접 호출 차단)하며,
--     · cg_events 의 휴가 이벤트 DELETE 를 RLS 에서 차단(취소 결재 흐름으로만 제거)한다.
--
--   짝이 되는 코드: app/api/vacation/requests/[id]/route.ts (승인 → RPC 호출)
--                  app/api/vacation-cancel-requests/[id]/route.ts (취소 승인 → RPC 호출)
--                  app/api/events/[id]/route.ts (DELETE 에 is_vacation 가드 추가)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

BEGIN;

------------------------------------------------------------
-- 1) 휴가 신청 승인 RPC — 이벤트 생성 + 상태 갱신을 원자적으로
--    행 잠금(FOR UPDATE)으로 동시 승인을 직렬화하여 이중 이벤트 생성을 차단한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_vacation_request(
  p_request_id uuid,
  p_reviewer_id uuid
)
RETURNS uuid                    -- 생성된 cg_events.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r cg_vacation_requests%ROWTYPE;
  v_event_id uuid;
BEGIN
  -- 신청 행 잠금 → 동시 승인 직렬화
  SELECT * INTO r FROM cg_vacation_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED' USING ERRCODE = 'raise_exception';
  END IF;

  -- 신청자 명의로 휴가 이벤트 생성 (SECURITY DEFINER → RLS 우회)
  INSERT INTO cg_events (
    title, description, start_at, end_at, is_all_day,
    is_vacation, visibility, color, category_id, created_by, team_id
  )
  VALUES (
    r.title, r.description, r.start_at, r.end_at, r.is_all_day,
    true, 'company', '#F97316', NULL, r.requested_by, NULL
  )
  RETURNING id INTO v_event_id;

  UPDATE cg_vacation_requests
     SET status      = 'approved',
         event_id    = v_event_id,
         reviewed_by = p_reviewer_id,
         reviewed_at = now()
   WHERE id = p_request_id;

  RETURN v_event_id;
END;
$$;

------------------------------------------------------------
-- 2) 휴가 취소 승인 RPC — 스냅샷 기록 + 이벤트 삭제를 원자적으로
------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_vacation_cancel(
  p_cancel_id uuid,
  p_reviewer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c  cg_vacation_cancel_requests%ROWTYPE;
  ev cg_events%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cg_vacation_cancel_requests WHERE id = p_cancel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF c.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED' USING ERRCODE = 'raise_exception';
  END IF;

  -- 삭제 전 이벤트 스냅샷 (이미 사라졌으면 NULL 스냅샷)
  IF c.event_id IS NOT NULL THEN
    SELECT * INTO ev FROM cg_events WHERE id = c.event_id;
  END IF;

  UPDATE cg_vacation_cancel_requests
     SET status           = 'approved',
         reviewed_by      = p_reviewer_id,
         reviewed_at      = now(),
         event_title      = ev.title,
         event_start_at   = ev.start_at,
         event_end_at     = ev.end_at,
         event_is_all_day = ev.is_all_day
   WHERE id = p_cancel_id;

  -- 휴가 이벤트 제거 (SECURITY DEFINER → 아래 RLS 차단과 무관하게 정당 경로로 삭제)
  IF c.event_id IS NOT NULL THEN
    DELETE FROM cg_events WHERE id = c.event_id;
  END IF;
END;
$$;

------------------------------------------------------------
-- 3) RPC 실행 권한 제한 — 브라우저(anon/authenticated) 직접 호출 차단, service_role 만 허용
--    라우트가 createAdminClient(service_role) 로 호출하며, 그 전에 결재 권한을 검증한다.
------------------------------------------------------------
REVOKE ALL ON FUNCTION approve_vacation_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION approve_vacation_cancel(uuid, uuid)  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_vacation_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION approve_vacation_cancel(uuid, uuid)  TO service_role;

------------------------------------------------------------
-- 4) 휴가 이벤트 직접 삭제 차단 — 취소 결재 흐름(위 RPC)으로만 제거
--    비휴가 이벤트 삭제는 기존과 동일. 예외적 정리는 SQL Editor(service_role, BYPASSRLS)에서 수행.
------------------------------------------------------------
DROP POLICY IF EXISTS "events_delete" ON cg_events;
CREATE POLICY "events_delete" ON cg_events FOR DELETE
  USING (
    is_active_user()
    AND coalesce(is_vacation, false) = false
    AND (created_by = auth.uid() OR current_user_role() = 'admin')
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── 롤백 (문제 시) ─────────────────────────────────────────
-- DROP FUNCTION IF EXISTS approve_vacation_request(uuid, uuid);
-- DROP FUNCTION IF EXISTS approve_vacation_cancel(uuid, uuid);
-- DROP POLICY IF EXISTS "events_delete" ON cg_events;
-- CREATE POLICY "events_delete" ON cg_events FOR DELETE
--   USING (is_active_user() AND (created_by = auth.uid() OR current_user_role() = 'admin'));
-- NOTIFY pgrst, 'reload schema';
