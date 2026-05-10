# 멀티테넌시(회사별 격리) 도입 계획

## Context

현재 그룹웨어는 단일 회사 전용으로 설계되어 있어 모든 `cg_*` 테이블에 `company_id` 개념이 없습니다. 사용자는 이 앱을 **여러 회사**가 동시에 사용하되,
1. 회원가입 시 회사명이 노출되지 않을 것
2. 한 회사가 다른 회사의 존재 자체를 알지 못할 것
3. 데이터·파일·검색 결과 어디서도 타 회사 정보가 새지 않을 것

을 요구합니다. 이를 위해 **운영자(슈퍼관리자)가 직접 회사를 생성**하고, 각 회사 관리자는 **초대 링크/코드** 또는 **계정 직접 생성** 두 가지 방식으로 회원을 모집할 수 있도록 합니다. 기존 데이터는 모두 "기본 회사" 1개로 이관합니다. 격리는 **DB 레벨 RLS**로 강제해 코드 실수가 있어도 누수가 발생하지 않도록 합니다.

---

## 결정사항 요약

| 항목 | 결정 |
|------|------|
| 회사 생성 권한 | **슈퍼관리자(운영자)만** — `/super-admin/*` 별도 패널 |
| 기존 데이터 | **기본 회사로 이관** (백필 후 NOT NULL 적용) |
| 초대 방식 | **초대 링크/코드 + 관리자 직접 생성 (둘 다 지원)** |
| 회사명 노출 | 로그인 후 **헤더 + 자기 회사 컨텐츠 전반** (타 회사 정보는 절대 노출 X) |
| 격리 방식 | DB 레벨 RLS 강제 (`current_user_company()` 헬퍼 기반) |

---

## 1. DB 스키마 변경

### 1.1 신규 테이블

**`cg_companies`** — 테넌트 마스터
```
id           uuid PK
name         text NOT NULL
created_at   timestamptz default now()
created_by   uuid (슈퍼관리자 id, nullable)
is_active    boolean default true
```

**`cg_super_admins`** — 운영자 명단 (회사에 속하지 않음)
```
user_id      uuid PK references auth.users(id)
created_at   timestamptz default now()
```

**`cg_invite_codes`** — 회사 초대 코드/링크
```
id            uuid PK
company_id    uuid NOT NULL → cg_companies
code          text UNIQUE NOT NULL  (URL-safe, 16자 정도)
created_by    uuid → cg_profiles
expires_at    timestamptz NULL
max_uses      int NULL  (NULL = 무제한)
used_count    int default 0
is_revoked    boolean default false
created_at    timestamptz default now()
```

### 1.2 기존 테이블 컬럼 추가 — `company_id uuid NOT NULL → cg_companies`

다음 **모든** `cg_*` 테이블에 추가:
- `cg_profiles`, `cg_teams`, `cg_events`, `cg_event_categories`, `cg_notices`, `cg_notice_attachments`, `cg_todos`, `cg_vacation_allocations`, `cg_vacation_cancel_requests`, `cg_office_networks`, `cg_attendance`, `cg_messages`

**`cg_company_settings`**: 현재 싱글톤 1행 → `company_id`를 PK로 변경(회사당 1행).

### 1.3 RLS 헬퍼 추가

```sql
create or replace function current_user_company() returns uuid
language sql stable security definer set search_path=public as $$
  select company_id from cg_profiles where id = auth.uid()
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from cg_super_admins where user_id = auth.uid())
$$;
```

### 1.4 RLS 정책 재작성

`output/step2_rls_policies.sql`의 모든 정책에 **`AND company_id = current_user_company()`** 추가. 슈퍼관리자는 `is_super_admin()` 분기로 전사 접근 허용(필요 시).
- `cg_profiles.profiles_select_active` → 같은 회사 활성 사용자만
- `cg_events.events_select_company` → `visibility='company' AND company_id=current_user_company()`
- `cg_events.events_select_team` → `team_id=current_user_team() AND company_id=current_user_company()`
- (전 테이블 동일 패턴)
- `cg_invite_codes`: 자기 회사 admin만 SELECT/INSERT/UPDATE
- `cg_companies`: 슈퍼관리자만 SELECT/INSERT/UPDATE; 일반 사용자는 자기 회사 1행만 SELECT
- `cg_super_admins`: 슈퍼관리자만 접근

### 1.5 회원가입 트리거 재작성

`output/step3_trigger.sql`의 `handle_new_user()` 변경:
- `raw_user_meta_data->>'company_id'`를 읽어 `cg_profiles.company_id`에 저장
- 기존 "첫 사용자 → admin/active" 로직은 **회사별 첫 사용자**로 변경 (해당 `company_id`의 프로필 수가 0일 때만 admin/active)
- 회사 생성 시 **카테고리 기본 6개**(`supabase/seed.sql`)를 해당 회사에 자동 INSERT — `cg_companies` AFTER INSERT 트리거로 처리

---

## 2. 백엔드(API) 변경

### 2.1 변경할 기존 라우트
- `app/api/auth/signup/route.ts` — 요청 본문에 `inviteCode` 추가 → `cg_invite_codes`에서 조회·검증(만료·사용한도·revoke) → `company_id` 추출 → `auth.admin.createUser`의 `user_metadata.company_id`로 전달 → `used_count++`
- `app/api/admin/users/route.ts` (POST 신설) — 관리자가 본인 회사 사용자 직접 생성 (이메일+이름 입력, 임시 비밀번호 또는 `auth.admin.generateLink`로 비번 설정 링크 발송)
- `app/api/admin/users/[id]/route.ts` — RLS로 자동 격리되지만, 추가 안전망으로 PATCH 시 `company_id` 일치 검증
- `app/api/profiles/list/route.ts`, `app/api/teams/members/route.ts` — RLS가 처리, 코드 변경 거의 없음
- `lib/supabase/queries/*.ts` (6개 파일) — **변경 불필요** (RLS가 자동 필터링). 단, `countActiveProfiles()`는 회사 범위로만 카운트되므로 의미가 자동 보정됨

### 2.2 신규 라우트
- `app/api/admin/invites/route.ts` — GET(자기 회사 초대코드 목록), POST(생성: expires_at·max_uses 옵션)
- `app/api/admin/invites/[id]/route.ts` — DELETE(revoke)
- `app/api/super-admin/companies/route.ts` — GET·POST(회사 + 초기 관리자 계정 동시 생성)
- `app/api/super-admin/companies/[id]/route.ts` — PATCH(name 수정, is_active 토글)
- `app/api/invites/validate/route.ts` (public) — POST `{code}` → `{valid, companyName}` 응답. **회사명은 코드가 유효할 때만 반환**(브루트포스 방지를 위해 rate limit 권장)

### 2.3 미들웨어
`middleware.ts`에 `/super-admin/*` 보호 추가: `is_super_admin()` 아닌 사용자는 `/calendar`로 리다이렉트.

---

## 3. UI 변경

### 3.1 회원가입 (`app/(public)/signup/page.tsx`)
- URL `/signup?code=XXXX`로 진입 시 코드 자동 채움(read-only)
- 코드 없는 직접 진입 시 **"초대 코드"** 입력 필드 표시
- 입력하면 `/api/invites/validate`로 검증 → 코드 유효 시에만 회사명을 작은 텍스트로 보여줌("○○회사에 가입합니다")
- **회사 목록(드롭다운) 없음** — 코드를 모르면 회사 존재 자체를 알 수 없음

### 3.2 관리자 패널 (`app/admin/page.tsx`)
- 신규 탭: **"초대"** — 코드 발급(만료일·사용한도 옵션), 링크 복사, revoke
- 회원관리 탭: **"사용자 직접 추가"** 버튼 — 모달에서 이메일·이름 입력 → 임시 비밀번호 또는 비번 설정 링크 발송 선택
- 설정 탭: 회사명 수정 가능

### 3.3 슈퍼관리자 패널 (신규)
- 라우트: `app/super-admin/page.tsx`
- 탭: 회사 목록 / 회사 생성 / 슈퍼관리자 관리
- 회사 생성 시: 회사명 + 초기 관리자(이메일+이름) → 자동으로 `cg_companies` INSERT + 트리거가 카테고리 시드 + 관리자 계정 생성(`auth.admin.createUser`) + 임시 비밀번호 또는 비번 설정 링크
- 일반 헤더와 분리된 단순 UI

### 3.4 헤더 (`components/layout/Header.tsx` 또는 유사)
- 자기 회사명을 좌측 로고 옆에 표시 (자기 회사만 보이므로 정보 누수 없음)
- 슈퍼관리자에게는 회사 전환 셀렉터 표시(선택사항)

---

## 4. 스토리지 격리

현재 두 버킷 모두 `company_id` 접두 없음:
- `notice-images` — `components/notices/NoticeEditor.tsx:29,31`
- `notice-attachments` — `app/(app)/notices/new/page.tsx:56,58`

### 변경
- **경로 규칙**: `${company_id}/${notice_id}/${ts}-${file.name}`
- **버킷 정책(RLS)**: 객체의 첫 번째 path segment(`storage.foldername(name)[1]`)가 `current_user_company()::text`와 일치할 때만 SELECT/INSERT/DELETE 허용
- 업로드 코드 2곳 수정해 경로 앞에 `company_id` prepend
- 기존 객체는 마이그레이션 스크립트로 `${default_company_id}/` 접두를 붙여 이동(또는 `cg_notice_attachments.url`을 모두 갱신)

---

## 5. 마이그레이션 절차

`output/`에 단계별 SQL 추가 (기존 관행 유지):
1. **`step10_multitenancy_schema.sql`** — `cg_companies`, `cg_super_admins`, `cg_invite_codes` 생성
2. **`step10b_add_company_id.sql`** — 모든 기존 테이블에 `company_id uuid NULL` 추가 (NULL 허용 상태)
3. **`step10c_backfill.sql`** — 기본 회사 1행 INSERT → 모든 `cg_*` 행을 그 id로 UPDATE → `company_id` NOT NULL 적용 + FK 추가
4. **`step10d_helpers_and_rls.sql`** — 헬퍼 함수 + 모든 RLS 재정의(DROP + CREATE)
5. **`step10e_trigger_rewrite.sql`** — `handle_new_user()` 재정의 + `cg_companies` 생성 트리거(카테고리 시드)
6. **`step10f_storage_policies.sql`** — 버킷 정책 재정의
7. **수동 단계** — 기존 storage 객체를 `${default_company_id}/` 경로로 이동(스크립트 별도)
8. **`types/database.ts`** — `npx supabase gen types typescript`로 재생성

각 단계는 트랜잭션으로 감싸고, 백업 후 실행. 운영 중단 시간 최소화를 위해 2→3→4 순서가 중요(NULL 허용 상태에서 백필 후 NOT NULL).

---

## 6. 변경할 핵심 파일

**SQL 신규** (`output/`)
- `step10_multitenancy_schema.sql`, `step10b_add_company_id.sql`, `step10c_backfill.sql`, `step10d_helpers_and_rls.sql`, `step10e_trigger_rewrite.sql`, `step10f_storage_policies.sql`

**백엔드 수정**
- `app/api/auth/signup/route.ts` — 초대 코드 검증 추가
- `middleware.ts` — `/super-admin/*` 가드
- `app/(app)/notices/new/page.tsx:56,58` — 업로드 경로 prefix
- `components/notices/NoticeEditor.tsx:29,31` — 업로드 경로 prefix

**백엔드 신규**
- `app/api/admin/invites/route.ts`, `app/api/admin/invites/[id]/route.ts`
- `app/api/admin/users/route.ts` (POST 추가)
- `app/api/super-admin/companies/route.ts`, `app/api/super-admin/companies/[id]/route.ts`
- `app/api/invites/validate/route.ts`

**UI 수정**
- `app/(public)/signup/page.tsx` — 초대 코드 입력
- `app/admin/page.tsx` — 초대 탭 + 사용자 직접 추가 모달
- 헤더 컴포넌트 — 회사명 표시

**UI 신규**
- `app/super-admin/page.tsx` (+ 하위 컴포넌트)

**타입**
- `types/database.ts` — 자동 재생성

---

## 7. 보안 고려사항

- **RLS가 1차 방어선**: 모든 격리는 RLS로 강제 → 코드 실수가 있어도 타 회사 데이터 누수 없음
- **service-role key 사용처** (`lib/supabase/server.ts:createAdminClient`, signup 라우트, 슈퍼관리자 라우트): RLS를 우회하므로 **회사 ID 검증을 코드에서 명시적으로 수행**해야 함
- **초대 코드 보안**:
  - 충분한 엔트로피(crypto.randomBytes 12바이트 → base64url 16자)
  - `/api/invites/validate`에 rate limit (브루트포스 방지)
  - revoke·만료·사용한도 지원
- **회사명 누수 차단점**:
  - login·signup·pending 페이지: 회사명 일체 표시 X
  - 에러 메시지: "회사를 찾을 수 없습니다" 같은 일반 문구만
  - 코드 invalid 시 회사명 미반환
- **슈퍼관리자 계정**: 별도 테이블로 관리, 회사에 속하지 않음(`company_id` NULL 허용 또는 프로필 자체 미생성)
- **카테고리·팀 등 시드 데이터**: 회사 생성 시 자동 복제(트리거)

---

## 8. 검증 체크리스트

- [ ] `npx tsc --noEmit` 통과
- [ ] 회사 A의 일반 사용자로 로그인 → 회사 B의 이벤트/공지/할일/팀/카테고리/메시지/출석 SELECT → **0건**
- [ ] 회사 A 관리자가 회사 B 사용자 PATCH 시도 → 거부
- [ ] 회사 A의 storage 객체를 회사 B 사용자가 직접 URL로 GET 시도 → 거부
- [ ] 슈퍼관리자가 회사 신규 생성 → `cg_event_categories`에 기본 6개 자동 시드 확인
- [ ] 잘못된 초대 코드로 회원가입 시도 → 명확한 에러, 회사명 미노출
- [ ] 만료/revoke된 초대 코드 → 거부
- [ ] 사용한도 max_uses 도달 → 거부
- [ ] 기본 회사로 이관된 기존 데이터가 모두 정상 표시되는지 (event/notice/todo/attendance/vacation 전부)
- [ ] `/super-admin/*`을 일반 사용자가 접근 → `/calendar` 리다이렉트
- [ ] 모바일·PC 헤더에 자기 회사명 표시 (다른 회사명은 어디에도 안 나옴)
- [ ] 회사 A의 초대 링크를 통해 신규 회원가입 → `cg_profiles.company_id` 정확히 매핑, pending 상태 진입

---

## 9. 단계별 추진 권장 순서

1. **Phase 1 (DB)**: step10 SQL 6종 작성 → 개발/스테이징에서 적용 → `npx supabase gen types`
2. **Phase 2 (Backend)**: signup·invites·super-admin API 구현 + 미들웨어
3. **Phase 3 (UI)**: 슈퍼관리자 패널 → 관리자 초대 탭 → signup 코드 필드 → 헤더 회사명
4. **Phase 4 (Storage)**: 업로드 경로 변경 + 버킷 정책 + 기존 객체 이전
5. **Phase 5 (검증)**: 위 체크리스트 전체 + 두 회사 데이터로 침투 테스트

각 Phase는 독립 배포 가능하지만 Phase 1·2는 함께 적용해야 정상 동작합니다.
