-- Seed: 기본 이벤트 카테고리 6개
-- Admin 계정은 첫 번째 회원가입자가 자동으로 admin + active 로 설정됩니다.

INSERT INTO cg_event_categories (id, name, color, is_default, created_by) VALUES
  (gen_random_uuid(), '회의', '#3B82F6', true, null),
  (gen_random_uuid(), '출장', '#8B5CF6', true, null),
  (gen_random_uuid(), '휴가', '#10B981', true, null),
  (gen_random_uuid(), '교육', '#F59E0B', true, null),
  (gen_random_uuid(), '행사', '#EF4444', true, null),
  (gen_random_uuid(), '기타', '#6B7280', true, null)
ON CONFLICT DO NOTHING;
