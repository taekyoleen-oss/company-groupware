-- 팀 약어 컬럼 추가 마이그레이션
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE cg_teams
  ADD COLUMN IF NOT EXISTS abbreviation text;
