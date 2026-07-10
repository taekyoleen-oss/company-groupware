-- 진단 (단일 쿼리 버전): 한 결과 패널에 모든 테이블 위치/행수가 나오도록 함
-- 실행: Supabase Dashboard > SQL Editor
-- ⚠ 결과가 한 행도 안 나오면 cg_* 테이블이 이 DB 에는 아예 존재하지 않는다는 뜻

WITH targets AS (
  SELECT unnest(ARRAY[
    'cg_messages',
    'cg_message_hides',
    'cg_vacation_requests',
    'cg_vacation_cancel_requests',
    'cg_events',
    'cg_attendance',
    'cg_office_networks',
    'cg_office_devices',
    'cg_profiles',
    'cg_vacation_allocations',
    'cg_company_settings',
    'cg_teams'
  ]) AS table_name
)
SELECT
  t.table_name                                 AS expected_table,
  ist.table_schema                             AS found_in_schema,
  CASE
    WHEN ist.table_schema IS NULL THEN '(MISSING)'
    ELSE COALESCE(
      (SELECT n_live_tup::text
       FROM pg_stat_user_tables s
       WHERE s.schemaname = ist.table_schema AND s.relname = t.table_name),
      '0'
    )
  END                                          AS approx_rows
FROM targets t
LEFT JOIN information_schema.tables ist
  ON ist.table_name = t.table_name
  AND ist.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY t.table_name, ist.table_schema NULLS LAST;
