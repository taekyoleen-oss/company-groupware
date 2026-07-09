-- Step 28: 컬럼 단위 권한 회수 — 브라우저 anon/authenticated 직결 경로의 권한 상승·민감정보 노출 차단
--
-- 배경
--   브라우저는 공개 anon 키로 supabase-js 를 통해 테이블에 직접 접근할 수 있으므로,
--   "쓰기 제한을 API 라우트 화이트리스트에만 의존"하면 RLS 만 통과하는 직접 호출로 우회된다.
--   이 마이그레이션은 세 테이블의 민감 컬럼에 대해 authenticated/anon 역할의 권한을
--   컬럼 단위로 회수하여, RLS 와 함께 이중 방어선을 만든다.
--   (service_role 은 BYPASSRLS + 전체 권한이므로 아래 REVOKE 의 영향을 받지 않는다.
--    민감 컬럼의 정당한 읽기/쓰기는 모두 service_role 서버 라우트로만 수행한다.)
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

------------------------------------------------------------
-- 1) cg_profiles — 권한 상승 차단
--    회원이 자기 행의 role/is_super_admin/status/approver_id 를 직접 바꿔
--    스스로 앱관리자로 승격하거나 pending 을 우회하는 것을 막는다.
--    본인 편집 허용 컬럼은 full_name / color / team_id 뿐이다.
------------------------------------------------------------
REVOKE UPDATE ON cg_profiles FROM authenticated, anon;
GRANT  UPDATE (full_name, color, team_id) ON cg_profiles TO authenticated;
-- role/is_super_admin/status/approver_id 변경은 service_role 라우트에서만:
--   /api/admin/users/[id], /api/admin/vacation/[userId], /api/auth/signup

------------------------------------------------------------
-- 2) cg_hr_records — 주민등록번호(resident_id)·인사메모(notes) 직접 조회 차단
--    본인 RLS(select_own)로도 이 두 컬럼은 읽을 수 없게 하고,
--    마스킹된 주민번호와 (앱관리자에 한한) 메모는 service_role 라우트에서만 노출한다.
------------------------------------------------------------
REVOKE SELECT ON cg_hr_records FROM authenticated, anon;
GRANT  SELECT (
  user_id, hire_date, hire_position, phone, emergency_contact,
  address, education, career, certificates, updated_at, updated_by
) ON cg_hr_records TO authenticated;
-- resident_id, notes 는 authenticated 직접 SELECT 불가.
--   /api/hr-records (본인, 마스킹) · /api/admin/hr-records/[userId] (앱관리자) 만 접근

------------------------------------------------------------
-- 3) cg_office_devices — 개인 PC 자가 승인 차단
--    회원이 자기 디바이스의 status 를 approved 로 직접 바꾸거나
--    승인 상태로 INSERT 하여 관리자 승인 게이트를 우회하는 것을 막는다.
--    출근 체크 시 last_ip/last_used_at 갱신만 본인에게 허용한다.
------------------------------------------------------------
REVOKE INSERT, UPDATE ON cg_office_devices FROM authenticated, anon;
GRANT  UPDATE (last_ip, last_used_at) ON cg_office_devices TO authenticated;
-- 디바이스 등록/재요청(status='pending')·관리자 승인/거절은 service_role 라우트에서만:
--   /api/attendance/device-register, /api/admin/office-devices/[id]

NOTIFY pgrst, 'reload schema';
