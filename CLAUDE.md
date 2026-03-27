# Company Groupware — 메인 오케스트레이터

> 설계서: `company-groupware-design-v1.2.md`
> 기술 스택: Next.js 15 (App Router) · TweakCN · Supabase · Vercel

---

## 프로젝트 개요

소규모 회사를 위한 **일정 관리 + 공지 게시판 + 개인 TO-DO** 통합 그룹웨어.
PC/모바일 반응형, 역할 기반 권한(Admin/Manager/Member), Supabase RLS 보안.

---

## 에이전트 역할 분담

| 에이전트 | 전문 영역 | AGENT.md 위치 |
|---------|---------|--------------|
| `db-architect` | Supabase 스키마·RLS·시드 SQL | `.claude/agents/db-architect/AGENT.md` |
| `api-designer` | Route Handler·쿼리 함수·middleware | `.claude/agents/api-designer/AGENT.md` |
| `ui-builder` | 페이지·컴포넌트·TweakCN 커스터마이징 | `.claude/agents/ui-builder/AGENT.md` |

## 스킬 목록

| 스킬 | 트리거 조건 |
|------|-----------|
| `calendar-view` | FullCalendar 설정·뷰 전환 구현 시 |
| `color-token` | 이벤트 색상 우선순위 계산 시 |
| `kakao-share` | 공유 버튼·포맷 텍스트 구현 시 |

---

## 구현 순서 (반드시 이 순서 준수)

### 1단계 — db-architect 호출

```
목표: Supabase DB 완전 셋업
출력: output/step1_schema.sql
      output/step2_rls_policies.sql
      supabase/seed.sql
      types/database.ts  (npx supabase gen types 로 생성)
```

작업 내용:
- 테이블 7개 생성: `cg_teams`, `cg_profiles`(department 없음), `cg_events`,
  `cg_event_categories`, `cg_notices`, `cg_notice_attachments`, `cg_todos`
- RLS 정책 적용 (설계서 섹션 3.4 기준)
- `supabase/seed.sql`: 최초 Admin 계정 + 기본 카테고리 6개 INSERT
- `types/database.ts` 타입 자동 생성

### 2단계 — api-designer 호출 (1단계 완료 후)

```
입력:  types/database.ts, 설계서 섹션 5~6
출력: app/api/**/*.ts
      lib/supabase/queries/*.ts
      middleware.ts
```

작업 내용:
- Supabase 쿼리 함수 (events, notices, todos, profiles, teams, categories)
- Route Handlers: CRUD + 팀 관리 + 카테고리(Admin) + 카카오 공유 포맷
- notices API: is_pinned role 검증 + 핀 제한(전사 ≤3/팀 ≤3)
- middleware.ts: 인증·pending·inactive 상태 라우트 보호

### 3단계 — ui-builder 호출 (2단계 완료 후, 페이지별 병렬 가능)

```
입력:  API 인터페이스, 설계서 섹션 4
출력: app/(public)/**/*.tsx
      app/(app)/**/*.tsx
      app/admin/page.tsx
      components/**/*.tsx
```

작업 우선순위:
1. 공통 레이아웃 (헤더·사이드바·하단탭) — 다른 모든 페이지의 의존성
2. 인증 페이지 (login·signup·pending)
3. 캘린더 메인 + EventModal
4. 공지 게시판 (목록·상세·작성)
5. TO-DO 페이지
6. 관리자 패널
7. 프로필·카카오 공유·미니 팝오버

---

## 중간 산출물 관리 규칙

- 모든 SQL 산출물 → `output/` 저장 후 다음 에이전트에 경로 전달
- 에이전트 간 타입 공유는 `types/database.ts` 단일 파일로 통일
- 에이전트가 기존 파일을 수정할 때는 반드시 먼저 Read 후 Edit

---

## 최종 통합 검증 체크리스트

- [ ] `npx tsc --noEmit` 오류 없음
- [ ] Supabase 대시보드에서 테이블 7개 + RLS 정책 확인
- [ ] Manager 계정으로 타인 private 이벤트 SELECT → 0건 확인
- [ ] 핀 고정 3개 초과 시 API 오류 반환 확인
- [ ] 모바일(375px) 월 뷰 기본, 캘린더 탭 기본 렌더링 확인
- [ ] inactive 계정 로그인 시 /login 리다이렉트 확인
- [ ] 공지/이벤트 상세에서 카카오 공유 모달 + 클립보드 복사 동작 확인

---

## 설계서 핵심 결정사항 요약 (에이전트 공통 참조)

| 항목 | 결정 |
|------|------|
| `cg_profiles.department` | **없음** — 팀명은 `cg_teams.name`만 사용 |
| private 이벤트 조회 | 본인만 가능, Manager 예외 없음 |
| Admin 권한 | 타인 이벤트/공지 수정+삭제 모두 가능, 복수 Admin 허용 |
| 카테고리 관리 | Admin만 추가/수정/삭제 |
| 모바일 기본 뷰 | 월 뷰(month view), 기본 탭: 캘린더 |
| 공지 에디터 | Tiptap (Bold/Italic/리스트/이미지 업로드) |
| 이벤트 설명란 | 일반 textarea |
| TO-DO 정렬 | 드래그&드롭, `sort_order` 필드 |
| 사용자 아바타 | 이니셜 + 12색 팔레트 원형 (이미지 업로드 없음) |
| 사이드바 일정 | 다가오는 3개 공개 일정 (company+team, private 제외) |
| 핀 고정 제한 | 전사 최대 3개 / 팀별 최대 3개 |
| 첨부파일 | 공지당 3개, 10MB, 이미지/PDF/Office |
| 비밀번호 재설정 | Admin에게 직접 문의 (이메일 초기화 없음) |
| 승인 알림 | 관리자 구두 통보 (시스템 알림 없음) |
| 팀 변경 시 데이터 | 기존 team 범위 이벤트/공지의 team_id 유지 |
| 최초 Admin | supabase/seed.sql로 INSERT |
