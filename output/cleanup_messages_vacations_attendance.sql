-- 메세지 알림 / 휴가 내용·취소 내용 / 출근 기록 전체 삭제
-- 실행 위치: Supabase Dashboard > SQL Editor
-- 주의: 되돌릴 수 없습니다. 실행 전 백업 권장.
--
-- 영향 범위
--   1) 메시지(전사·팀·1:1) 및 사용자별 숨김 기록
--   2) 휴가 신청(대기/승인/반려) + 휴가 취소 신청(대기/승인/반려)
--      + 실제 캘린더에 등록된 휴가 일정(cg_events.is_vacation = true)
--   3) GPS/IP/지문 등 모든 출근 체크 기록
--
-- 영향 받지 않는 데이터 (보존)
--   - 일반 일정(휴가 아님): cg_events.is_vacation = false 또는 NULL 유지
--   - 휴가일수 할당(cg_vacation_allocations) 유지
--   - 결재자 지정: cg_profiles.approver_id 유지 (cg_profiles 미수정)
--   - 허용 IP 자동 등록: cg_office_networks 전체 보존
--   - PC 디바이스 승인: cg_office_devices 전체 보존
--   - 회사 설정: cg_company_settings 보존
--   - 사용자/팀/카테고리/공지/TO-DO 미영향
--
-- 설계 메모
--   - 환경마다 일부 테이블이 다른 schema 에 있거나 미존재할 수 있음
--   - information_schema.tables 로 실제 schema 를 찾아 동적 삭제
--   - 모든 결과는 NOTICE 로 출력되므로 Supabase SQL Editor 의 "Messages" 탭 확인

BEGIN;

DO $$
DECLARE
  v_targets text[] := ARRAY[
    'cg_message_hides',
    'cg_messages',
    'cg_vacation_cancel_requests',
    'cg_vacation_requests',
    'cg_attendance'
  ];
  v_table   text;
  v_schema  text;
  v_deleted bigint;
  v_found   boolean;
BEGIN
  -- 1) 일반 테이블 전체 삭제 (모든 schema 의 동일 이름 모두)
  FOREACH v_table IN ARRAY v_targets
  LOOP
    v_found := false;
    FOR v_schema IN
      SELECT table_schema FROM information_schema.tables
      WHERE table_name = v_table
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
    LOOP
      v_found := true;
      EXECUTE format('DELETE FROM %I.%I', v_schema, v_table);
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      RAISE NOTICE '[deleted] %.%  (% rows)', v_schema, v_table, v_deleted;
    END LOOP;
    IF NOT v_found THEN
      RAISE NOTICE '[skipped — not exists anywhere] %', v_table;
    END IF;
  END LOOP;

  -- 2) cg_events 는 휴가 일정만 (is_vacation = true) 부분 삭제
  v_found := false;
  FOR v_schema IN
    SELECT table_schema FROM information_schema.tables
    WHERE table_name = 'cg_events'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
  LOOP
    v_found := true;
    EXECUTE format('DELETE FROM %I.cg_events WHERE is_vacation = true', v_schema);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE '[deleted] %.cg_events WHERE is_vacation=true  (% rows)', v_schema, v_deleted;
  END LOOP;
  IF NOT v_found THEN
    RAISE NOTICE '[skipped — not exists anywhere] cg_events';
  END IF;
END $$;

COMMIT;

-- 결과 확인 ---------------------------------------------------------------
DO $$
DECLARE
  rec record;
  v_count bigint;
BEGIN
  FOR rec IN
    SELECT 'DEL'  AS kind, 'cg_messages'                 AS tbl, ''::text AS where_clause UNION ALL
    SELECT 'DEL',  'cg_message_hides',                   '' UNION ALL
    SELECT 'DEL',  'cg_vacation_requests',               '' UNION ALL
    SELECT 'DEL',  'cg_vacation_cancel_requests',        '' UNION ALL
    SELECT 'DEL',  'cg_events',                          'WHERE is_vacation = true' UNION ALL
    SELECT 'DEL',  'cg_attendance',                      '' UNION ALL
    SELECT 'KEEP', 'cg_office_networks',                 '' UNION ALL
    SELECT 'KEEP', 'cg_office_devices',                  '' UNION ALL
    SELECT 'KEEP', 'cg_profiles',                        'WHERE approver_id IS NOT NULL' UNION ALL
    SELECT 'KEEP', 'cg_vacation_allocations',            ''
  LOOP
    DECLARE
      v_schema text;
      v_any boolean := false;
    BEGIN
      FOR v_schema IN
        SELECT table_schema FROM information_schema.tables
        WHERE table_name = rec.tbl
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
      LOOP
        v_any := true;
        EXECUTE format('SELECT COUNT(*) FROM %I.%I %s', v_schema, rec.tbl, rec.where_clause) INTO v_count;
        RAISE NOTICE '[%] %.% %  remaining=%', rec.kind, v_schema, rec.tbl, rec.where_clause, v_count;
      END LOOP;
      IF NOT v_any THEN
        RAISE NOTICE '[%] % — (not exists)', rec.kind, rec.tbl;
      END IF;
    END;
  END LOOP;
END $$;
