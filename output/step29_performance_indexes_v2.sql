-- Step 29: 누락 인덱스 보강 — 조인/필터 컬럼에 인덱스가 없어 순차 스캔이 발생하던 지점
--
-- 배경: Disk IO Budget 경고 대응. step22 에서 events/notices/messages/attendance/todos 는
--       인덱스가 있으나, 아래 컬럼들은 코드에서 조인·필터에 쓰이는데 인덱스가 없었다.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

-- 휴가 취소 신청: RLS EXISTS 및 목록 조회에서 사용 (requested_by / event_id / status)
CREATE INDEX IF NOT EXISTS idx_vacation_cancel_requested_by
  ON cg_vacation_cancel_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_vacation_cancel_event_id
  ON cg_vacation_cancel_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_vacation_cancel_status
  ON cg_vacation_cancel_requests(status);

-- 휴가 신청: 이력 조회에서 .in('event_id', ...) 로 조인
CREATE INDEX IF NOT EXISTS idx_vacation_requests_event_id
  ON cg_vacation_requests(event_id);

-- 공지 첨부: 공지 목록마다 attachments:cg_notice_attachments(*) 중첩 조회 (FK 인덱스 부재)
CREATE INDEX IF NOT EXISTS idx_notice_attachments_notice_id
  ON cg_notice_attachments(notice_id);

-- 프로필 팀 필터: 팀원 조회 및 RLS current_user_team 비교
CREATE INDEX IF NOT EXISTS idx_profiles_team_id
  ON cg_profiles(team_id);

NOTIFY pgrst, 'reload schema';
