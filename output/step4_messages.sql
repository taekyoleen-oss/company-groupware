-- =====================================================
-- Step 4: In-app Messaging System
-- Supabase SQL Editor에서 실행하세요
-- =====================================================

CREATE TABLE IF NOT EXISTS cg_messages (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id      uuid        REFERENCES auth.users(id)  ON DELETE CASCADE NOT NULL,
  sender_name    text        NOT NULL,
  recipient_id   uuid        REFERENCES auth.users(id)  ON DELETE CASCADE,
  recipient_name text,                          -- 개인 수신자 이름 (팀 메시지는 NULL)
  team_id        uuid        REFERENCES cg_teams(id)    ON DELETE CASCADE,
  team_name      text,                          -- 팀 메시지 대상 팀명 (개인 메시지는 NULL)
  content        text        NOT NULL,
  is_read        boolean     DEFAULT false NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT check_recipient CHECK (
    (recipient_id IS NOT NULL AND team_id IS NULL) OR
    (recipient_id IS NULL     AND team_id IS NOT NULL)
  )
);

-- Realtime 활성화
ALTER TABLE cg_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE cg_messages;

-- RLS 활성화
ALTER TABLE cg_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select" ON cg_messages FOR SELECT USING (
  is_active_user() AND (
    sender_id    = auth.uid() OR
    recipient_id = auth.uid() OR
    (team_id IS NOT NULL AND team_id = current_user_team())
  )
);
CREATE POLICY "messages_insert" ON cg_messages FOR INSERT WITH CHECK (
  is_active_user() AND sender_id = auth.uid()
);
CREATE POLICY "messages_update" ON cg_messages FOR UPDATE USING (
  recipient_id = auth.uid() OR
  (team_id IS NOT NULL AND team_id = current_user_team())
);
