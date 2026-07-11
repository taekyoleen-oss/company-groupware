-- ============================================================
-- [미사용 초안 — 실행하지 마세요]
-- 실제 적용은 2026-07-11 사용자 확정안(본인 결재·해당일 결재·제목 통일)으로
-- REST API를 통해 완료됨. output/휴가전환_적용결과_20260711.md 참조.
-- 이 파일을 지금 실행하면 결재 이력이 중복 생성됩니다.
-- ============================================================
-- 휴가 전환 실행안 (초안) — 2026-07-11
-- ⚠ 아직 실행하지 마세요. output/휴가전환_검토_20260711.md 에서
--   전환 항목을 확정한 뒤, 체크되지 않은 항목의 블록을 삭제하고 실행합니다.
--
-- 원본 백업: output/휴가전환_백업_20260711.json
-- 모든 UPDATE 는 "AND is_vacation = false" 가드가 있어 중복 실행돼도
-- 이미 전환된 행을 다시 건드리지 않습니다.
--
-- [옵션 A] 결재 이력 생성 INSERT 는 각 항목의 두 번째 문장입니다.
--   검토 문서에서 "생성 안 함"을 선택하면 INSERT 문만 삭제하세요.
--   승인자(reviewed_by): 강신홍·유정곤·이현태는 지정 결재자가 없어 앱관리자,
--   안기혜(#3)만 지정 결재자인 강신홍 명의로 승인 처리합니다 (기존 이력과 동일 패턴).
-- ============================================================

BEGIN;

-- 사용자 ID 참조
--   강신홍  695189ee-786f-4f09-8e95-eec3fef213c9
--   유정곤  5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c
--   안기혜  2219dad6-0688-4f4d-a025-457e1c90c8b3
--   이현태  8fcaf839-7c14-4780-bdde-e0214c617bf3
--   앱관리자 159b46d5-9411-406f-ab12-e9eaafe57c44

-- ------------------------------------------------------------
-- #1. 오전반차(강신홍) — 6/4 (본인 등록, 0.5일)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오전반차(강신홍)',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = '6bf9898c-269c-42e5-95ad-06c6b8bcfa04' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('695189ee-786f-4f09-8e95-eec3fef213c9', NULL, '오전반차(강신홍)',
   '2026-06-04 00:00:00+00', '2026-06-04 05:00:00+00', false,
   'approved', '6bf9898c-269c-42e5-95ad-06c6b8bcfa04',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #2. 오후반차(유정곤) — 6/5 (본인 등록, 0.5일, 시작시각 13:00→14:00 정규화)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오후반차(유정곤)',
  start_at = '2026-06-05 05:00:00+00',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = 'adb846a7-7c63-42ca-b431-5a5a1a159f96' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c', NULL, '오후반차(유정곤)',
   '2026-06-05 05:00:00+00', '2026-06-05 09:00:00+00', false,
   'approved', 'adb846a7-7c63-42ca-b431-5a5a1a159f96',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #3. 오전반차(안기혜) — 6/18 (⚠ 대리등록: 소유자 유연재 → 안기혜, 0.5일)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오전반차(안기혜)',
  created_by = '2219dad6-0688-4f4d-a025-457e1c90c8b3',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = 'ba33b5d5-de12-4333-8912-22a27efdd20e' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  -- 안기혜의 지정 결재자는 강신홍 → approver/승인자 모두 강신홍 (기존 7/2 오전반차 이력과 동일)
  ('2219dad6-0688-4f4d-a025-457e1c90c8b3', '695189ee-786f-4f09-8e95-eec3fef213c9', '오전반차(안기혜)',
   '2026-06-18 00:00:00+00', '2026-06-18 05:00:00+00', false,
   'approved', 'ba33b5d5-de12-4333-8912-22a27efdd20e',
   '695189ee-786f-4f09-8e95-eec3fef213c9', now());

-- ------------------------------------------------------------
-- #4. 휴가(유정곤) — 6/18 종일 (⚠ 대리등록: 소유자 유연재 → 유정곤, 1.0일,
--     시간 표준 종일형(KST 00:00~23:59)으로 정규화)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '휴가(유정곤)',
  created_by = '5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c',
  start_at = '2026-06-17 15:00:00+00',
  end_at   = '2026-06-18 14:59:00+00',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = 'c47eff40-2b68-454b-9ff1-a32e74885234' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c', NULL, '휴가(유정곤)',
   '2026-06-17 15:00:00+00', '2026-06-18 14:59:00+00', true,
   'approved', 'c47eff40-2b68-454b-9ff1-a32e74885234',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #5. 오전반차(이현태) — 6/18 (⚠ 대리등록: 소유자 유연재 → 이현태, 0.5일)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오전반차(이현태)',
  created_by = '8fcaf839-7c14-4780-bdde-e0214c617bf3',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = 'd7ad6382-bbf7-40ed-a1ee-e202d4c9e67e' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('8fcaf839-7c14-4780-bdde-e0214c617bf3', NULL, '오전반차(이현태)',
   '2026-06-18 00:00:00+00', '2026-06-18 05:00:00+00', false,
   'approved', 'd7ad6382-bbf7-40ed-a1ee-e202d4c9e67e',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #6. 오후반차(유정곤) — 6/26 (본인 등록, 0.5일)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오후반차(유정곤)',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = 'f4df7f2e-0fc9-4181-84e8-1207e6581ca9' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c', NULL, '오후반차(유정곤)',
   '2026-06-26 05:00:00+00', '2026-06-26 09:00:00+00', false,
   'approved', 'f4df7f2e-0fc9-4181-84e8-1207e6581ca9',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #7. 오전반차(강신홍) — 7/2 (본인 등록, 0.5일, 종료시각 22:02→14:00 정규화)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오전반차(강신홍)',
  end_at = '2026-07-02 05:00:00+00',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = '0688d8b5-5752-4a62-b801-8d2e5254b773' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('695189ee-786f-4f09-8e95-eec3fef213c9', NULL, '오전반차(강신홍)',
   '2026-07-02 00:00:00+00', '2026-07-02 05:00:00+00', false,
   'approved', '0688d8b5-5752-4a62-b801-8d2e5254b773',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #8. 오전반차(유정곤) — 7/3 (⚠ 대리등록: 소유자 유연재 → 유정곤, 0.5일)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오전반차(유정곤)',
  created_by = '5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = 'b3beb114-d3ea-476e-b907-6a42c60cd8f9' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c', NULL, '오전반차(유정곤)',
   '2026-07-03 00:00:00+00', '2026-07-03 05:00:00+00', false,
   'approved', 'b3beb114-d3ea-476e-b907-6a42c60cd8f9',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

-- ------------------------------------------------------------
-- #9. 오후반차(유정곤) — 7/9 (⚠ 대리등록: 소유자 유연재 → 유정곤, 0.5일)
-- ------------------------------------------------------------
UPDATE cg_events SET
  title = '오후반차(유정곤)',
  created_by = '5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c',
  is_vacation = true,
  color = '#F97316',
  updated_at = now()
WHERE id = '127cfcc2-da9e-49d3-83e2-a5bdec882ee8' AND is_vacation = false;

INSERT INTO cg_vacation_requests
  (requested_by, approver_id, title, start_at, end_at, is_all_day, status, event_id, reviewed_by, reviewed_at)
VALUES
  ('5e91ab9c-f2d0-4c05-9fbc-28dec5c6f43c', NULL, '오후반차(유정곤)',
   '2026-07-09 05:00:00+00', '2026-07-09 09:00:00+00', false,
   'approved', '127cfcc2-da9e-49d3-83e2-a5bdec882ee8',
   '159b46d5-9411-406f-ab12-e9eaafe57c44', now());

COMMIT;

-- ============================================================
-- 검증 쿼리 (실행 후 확인)
-- ============================================================

-- 1) 9건 모두 is_vacation=true 로 전환됐는지 (기대: 9행, 모두 true)
SELECT id, title, is_vacation, color,
       (start_at AT TIME ZONE 'Asia/Seoul')::date AS kst_date,
       p.full_name AS owner
FROM cg_events e
JOIN cg_profiles p ON p.id = e.created_by
WHERE e.id IN (
  '6bf9898c-269c-42e5-95ad-06c6b8bcfa04','adb846a7-7c63-42ca-b431-5a5a1a159f96',
  'ba33b5d5-de12-4333-8912-22a27efdd20e','c47eff40-2b68-454b-9ff1-a32e74885234',
  'd7ad6382-bbf7-40ed-a1ee-e202d4c9e67e','f4df7f2e-0fc9-4181-84e8-1207e6581ca9',
  '0688d8b5-5752-4a62-b801-8d2e5254b773','b3beb114-d3ea-476e-b907-6a42c60cd8f9',
  '127cfcc2-da9e-49d3-83e2-a5bdec882ee8'
)
ORDER BY start_at;

-- 2) 2026년 인별 휴가 사용일수 (관리자 화면과 동일 로직의 근사 확인용)
--    기대 증가: 강신홍 +1.0 / 유정곤 +3.0 / 안기혜 +0.5 / 이현태 +0.5 / 유연재 ±0
SELECT p.full_name,
       SUM(CASE WHEN e.is_all_day THEN 1.0 ELSE 0.5 END) AS approx_days  -- 주말·공휴일 미제외 근사치
FROM cg_events e
JOIN cg_profiles p ON p.id = e.created_by
WHERE e.is_vacation = true
  AND e.start_at >= '2025-12-22'
GROUP BY p.full_name
ORDER BY p.full_name;
