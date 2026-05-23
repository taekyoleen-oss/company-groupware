-- Step 22: 성능용 인덱스 일괄 추가
-- - 자주 쿼리되는 컬럼/조합에 인덱스 보강.
-- - 모두 IF NOT EXISTS — 멱등(재실행 안전).
-- - 데이터·정책·동작 변경 없음. 순수 성능 향상.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run

------------------------------------------------------------
-- cg_events — 캘린더 메인 쿼리 (start_at 범위 + visibility + 본인/팀 필터)
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cg_events_start_at
  ON cg_events(start_at);

CREATE INDEX IF NOT EXISTS idx_cg_events_visibility_start_at
  ON cg_events(visibility, start_at);

CREATE INDEX IF NOT EXISTS idx_cg_events_created_by
  ON cg_events(created_by);

CREATE INDEX IF NOT EXISTS idx_cg_events_team_id
  ON cg_events(team_id);

-- 휴가 이벤트만 골라 보는 케이스(상위 쿼리에서 빈도 높음)
CREATE INDEX IF NOT EXISTS idx_cg_events_is_vacation_partial
  ON cg_events(is_vacation, start_at)
  WHERE is_vacation = true;

------------------------------------------------------------
-- cg_notices — 핀 + 최신순 정렬, 가시범위 필터
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cg_notices_pinned_created
  ON cg_notices(is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cg_notices_visibility
  ON cg_notices(visibility);

CREATE INDEX IF NOT EXISTS idx_cg_notices_created_by
  ON cg_notices(created_by);

CREATE INDEX IF NOT EXISTS idx_cg_notices_team_id
  ON cg_notices(team_id);

------------------------------------------------------------
-- cg_messages — 받은편지함 / 팀 메시지 정렬
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cg_messages_recipient_created
  ON cg_messages(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cg_messages_team_created
  ON cg_messages(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cg_messages_sender_created
  ON cg_messages(sender_id, created_at DESC);

------------------------------------------------------------
-- cg_attendance — (user_id, date) UNIQUE 제약이 이미 인덱스 역할.
--   날짜 단독 조회(관리자 일별 현황) 보강.
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cg_attendance_date
  ON cg_attendance(date);

------------------------------------------------------------
-- cg_todos — 본인 정렬 조회
------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cg_todos_user_sort
  ON cg_todos(user_id, sort_order);

------------------------------------------------------------
-- PostgREST 스키마 캐시 갱신
------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
