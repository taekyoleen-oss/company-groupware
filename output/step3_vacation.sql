-- Step 3: 휴가 관리 기능 추가

-- 1. cg_events에 is_vacation 컬럼 추가
ALTER TABLE cg_events ADD COLUMN IF NOT EXISTS is_vacation boolean NOT NULL DEFAULT false;

-- 2. 휴가 할당량 테이블 생성 (사용자별 연도별 1건)
CREATE TABLE IF NOT EXISTS cg_vacation_allocations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_days integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year)
);

-- 3. RLS 활성화
ALTER TABLE cg_vacation_allocations ENABLE ROW LEVEL SECURITY;

-- 4. 본인 조회 허용
CREATE POLICY "vacation_alloc_select_self"
  ON cg_vacation_allocations FOR SELECT
  USING (user_id = auth.uid());

-- 5. 관리자 전체 권한
CREATE POLICY "vacation_alloc_admin_all"
  ON cg_vacation_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cg_profiles
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );
