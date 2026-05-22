-- Step 18: cg_teams.sort_order 컬럼 추가 (팀 정렬 순서)
-- - 앱관리자가 팀 관리 탭에서 ↑↓ 로 변경 가능
-- - 회원/출근/휴가 관리도 이 순서대로 그룹화되고, 같은 팀 안에서는 이름순(가나다)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

ALTER TABLE cg_teams
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1000;

-- 모든 팀이 default 값(1000) 그대로면 이름순으로 10, 20, 30 ... 부여
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM cg_teams) > 0
     AND (SELECT COUNT(DISTINCT sort_order) FROM cg_teams) <= 1 THEN
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY name) * 10 AS new_order
      FROM cg_teams
    )
    UPDATE cg_teams
       SET sort_order = ordered.new_order
      FROM ordered
     WHERE cg_teams.id = ordered.id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cg_teams_sort_order
  ON cg_teams(sort_order);

NOTIFY pgrst, 'reload schema';
