-- Step 25: 휴가 총일수(total_days)를 소수 첫째 자리까지 저장하도록 변경
-- - 반차(0.5일) 등 소수 단위 입력을 지원하기 위해 컬럼 타입을 integer → numeric(5,1) 로 변경

ALTER TABLE cg_vacation_allocations
  ALTER COLUMN total_days TYPE numeric(5,1)
  USING total_days::numeric(5,1);

-- 기본값 재지정 (정수 10 → 소수형 10.0)
ALTER TABLE cg_vacation_allocations
  ALTER COLUMN total_days SET DEFAULT 10.0;
