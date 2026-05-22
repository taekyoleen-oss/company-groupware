-- Step 16: 메시지 알림 개별/전체 삭제 (소프트 삭제)
-- - cg_message_hides: 메시지를 본인 알림 목록에서 숨긴 기록
-- - 직접 메시지는 sender/recipient 본인만 숨김, 팀 메시지는 팀원 본인 시야에서만 숨김
-- - 실제 cg_messages row 는 보존하므로 상대방의 시야에는 영향 없음
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 Run (멱등 — 재실행 안전)

CREATE TABLE IF NOT EXISTS cg_message_hides (
  message_id uuid        NOT NULL REFERENCES cg_messages(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  hidden_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_hides_user
  ON cg_message_hides(user_id);

ALTER TABLE cg_message_hides ENABLE ROW LEVEL SECURITY;

-- 본인의 hide 기록만 조회
DROP POLICY IF EXISTS "message_hides_select_own" ON cg_message_hides;
CREATE POLICY "message_hides_select_own"
  ON cg_message_hides FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 본인의 hide 만 생성 가능
DROP POLICY IF EXISTS "message_hides_insert_own" ON cg_message_hides;
CREATE POLICY "message_hides_insert_own"
  ON cg_message_hides FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 본인의 hide 만 해제 가능
DROP POLICY IF EXISTS "message_hides_delete_own" ON cg_message_hides;
CREATE POLICY "message_hides_delete_own"
  ON cg_message_hides FOR DELETE TO authenticated
  USING (user_id = auth.uid());
