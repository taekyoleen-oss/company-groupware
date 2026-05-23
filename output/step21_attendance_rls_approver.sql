-- Step 21: cg_attendance 결재자/사장님 팀/super_admin 의 SELECT 권한 보강
-- - 매니저(approver)가 자기 결재 대상(approver_id = me) 직원의 출근/퇴근을 조회할 수 있게 한다.
-- - 사장님 팀 소속은 전 활성 직원의 출근 조회 가능.
-- - 기존 attendance_select_self / attendance_select_admin 정책은 유지.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

-- 1) 결재자(매니저)는 본인이 결재자인 직원의 출근 조회 가능
DROP POLICY IF EXISTS "attendance_select_approver" ON cg_attendance;
CREATE POLICY "attendance_select_approver"
  ON cg_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles p
      WHERE p.id = cg_attendance.user_id
        AND p.approver_id = auth.uid()
    )
  );

-- 2) 사장님 팀 소속은 전 활성 직원의 출근 조회 가능
DROP POLICY IF EXISTS "attendance_select_president_team" ON cg_attendance;
CREATE POLICY "attendance_select_president_team"
  ON cg_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM cg_profiles me
      JOIN cg_teams t ON t.id = me.team_id
      WHERE me.id = auth.uid()
        AND t.name = '사장님'
        AND me.status = 'active'
    )
  );

-- 3) is_super_admin = true 인 회원도 명시적으로 전 직원 조회 허용
--    (기존 attendance_select_admin 은 role='admin' 만 검사하므로,
--     마이그레이션 도중 role 값이 다른 super_admin 환경 호환용)
DROP POLICY IF EXISTS "attendance_select_super_admin" ON cg_attendance;
CREATE POLICY "attendance_select_super_admin"
  ON cg_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid()
        AND is_super_admin = true
    )
  );

NOTIFY pgrst, 'reload schema';
