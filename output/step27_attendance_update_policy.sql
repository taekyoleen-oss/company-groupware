-- Step 27: cg_attendance 본인 UPDATE 정책 추가 — 퇴근 처리 복구
--
-- 증상
--   1) "퇴근 확인" 클릭 시: Cannot coerce the result to a single JSON object
--   2) 출근 이력 다운로드의 '퇴근 시각'이 항상 빈칸
--
-- 근본 원인 (둘이 동일)
--   - cg_attendance 에는 SELECT / INSERT 정책만 있고 UPDATE 정책이 전혀 없음.
--   - RLS 가 켜진 테이블은 해당 명령에 대한 정책이 없으면 그 명령을 전부 거부.
--   - 따라서 본인 퇴근 시각(checked_out_at) UPDATE 가 항상 0건 → 저장 실패.
--     · checkout 라우트의 .update(...).select('*').single() 이 0건이 되어
--       "Cannot coerce the result to a single JSON object" 오류.
--     · checked_out_at 이 영원히 NULL 이라 다운로드 '퇴근 시각'도 빈칸.
--   - 확인: 전체 출근 56행 중 checked_out_at 이 채워진 행 0건.
--
-- 적용 위치: Supabase Dashboard → SQL Editor 에서 실행 (멱등 — 재실행 안전)

BEGIN;

-- 본인은 자신의 출근 행을 수정할 수 있다 (퇴근 시각 기록 / 18:00 자동보정).
-- INSERT 정책(attendance_insert_self)과 동일한 신뢰 모델(user_id = 본인)을 따른다.
DROP POLICY IF EXISTS "attendance_update_self" ON cg_attendance;
CREATE POLICY "attendance_update_self"
  ON cg_attendance FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────
-- (선택) 과거 미퇴근 행 일괄 보정
--   앱은 원래 "미입력 상태로 다음날이 지난 출근 행"을 18:00(KST)로 자동 보정한다
--   (step20 주석 + attendance/checkout PATCH 라우트). 이 규칙을 과거 누락분에
--   즉시 일괄 적용해, 다운로드에서 과거 '퇴근 시각'을 바로 채우고 싶을 때 실행.
--   ※ 실제 퇴근시각이 아니라 규칙상 18:00 으로 채우는 값임에 유의.
--   ※ 오늘(KST) 행은 아직 정상 퇴근 가능하므로 제외.
--
--   필요 없으면 아래 블록을 실행하지 말 것.
-- ─────────────────────────────────────────────────────────────────
UPDATE cg_attendance
SET checked_out_at = ((date + time '18:00') AT TIME ZONE 'Asia/Seoul')
WHERE checked_out_at IS NULL
  AND date < (now() AT TIME ZONE 'Asia/Seoul')::date;

-- ── 검증 쿼리 (수동 실행) ──────────────────────────────────────
-- SELECT count(*) FILTER (WHERE checked_out_at IS NOT NULL) AS with_checkout,
--        count(*) AS total
--   FROM cg_attendance;
