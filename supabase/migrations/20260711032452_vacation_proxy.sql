-- 휴가 대리 게시 기능
-- 1) 전사 1명의 대리 게시자 지정 — 회사 설정(단일 행)에 컬럼으로 보관해 "1명만" 구조적으로 보장
ALTER TABLE public.cg_company_settings
  ADD COLUMN IF NOT EXISTS vacation_proxy_user_id uuid REFERENCES public.cg_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cg_company_settings.vacation_proxy_user_id IS
  '앱관리자가 지정한 휴가 대리 게시자(전사 1명). NULL이면 대리 게시 기능 비활성.';

-- 2) 실제 게시자 기록 (감사 추적) — NULL이면 본인 신청
ALTER TABLE public.cg_vacation_requests
  ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES public.cg_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cg_vacation_requests.posted_by IS
  '대리 게시자 ID. NULL이면 본인이 직접 신청한 건.';
