# Company Groupware 웹 개발 설계서 v1.2

> **v1.1 변경 사항**: 팀 관리 단순화(가입 시 팀명 입력 → 관리자 수정), 알림 기능 v2.0 이월, TO-DO 개인 전용 명확화, 공지 작성 권한 전체 직원으로 확대(핀 고정만 Manager/Admin 유지)

> **v1.2 변경 사항** (인터뷰 결정사항 반영):
> - **권한 명확화**: Manager의 "팀원 일정 조회"는 팀/전사 공개 일정만 해당, private 일정은 본인 외 조회 불가
> - **스키마 변경**: `cg_profiles.department` 컬럼 제거 (부서명=팀명 통합), 최초 Admin 계정을 `seed.sql`로 삽입
> - **RLS 강화**: private 이벤트 Manager 예외 없음, Admin의 타인 이벤트/공지 수정+삭제 권한 명시, inactive 사용자 로그인 차단(데이터 유지)
> - **카테고리 관리**: Admin만 추가/수정/삭제, `/admin` 페이지에 카테고리 관리 탭 추가
> - **팀 변경 시 데이터**: 기존 `visibility='team'` 이벤트/공지의 `team_id`는 작성 시점 기준 유지
> - **UI 결정**: 모바일 기본 뷰 월 뷰, 기본 탭 캘린더, 사이드바에 다가오는 3개 공개 일정 표시
> - **프로필 아바타**: 이니셜 + 고정 12가지 색상 팔레트 (이미지 업로드 없음)
> - **캘린더 UX**: 빈 슬롯 클릭 시 날짜/시간 자동 입력된 일정 생성 모달, 일정 충돌 감지 없음
> - **공지 에디터**: Tiptap 리치 텍스트 (Bold/Italic/리스트 + 이미지 인라인 업로드), 이벤트 설명란은 일반 textarea
> - **공지 UX**: '전체 공지|팀 공지' 탭, 무한 스크롤, 핀 최대 3개(전사/팀별 독립), 제목 기반 검색
> - **첨부파일**: 공지당 최대 3개, 파일당 10MB, 이미지/PDF/Office 형식
> - **카카오 공유**: 공지 + 일정 모두 공유 버튼 (제목+내용 요약+링크 포맷)
> - **TO-DO**: 드래그&드롭으로 순서 변경 (`sort_order` 활용)
> - **사용자 관리**: 복수 Admin 허용, 비밀번호 재설정은 Admin에게 직접 문의, 승인 알림은 관리자 구두 통보

> 소규모 회사를 위한 **일정 관리 + 공지 게시판 + 개인 TO-DO** 통합 그룹웨어

---

## 1. 프로젝트 컨텍스트

### 1.1 목적 및 배경

소규모 회사에서 팀원들이 흩어진 카카오톡, 이메일, 구두 전달에 의존하던 일정 공유와 공지 전파를 하나의 웹 플랫폼으로 통합한다. PC와 모바일 모두에서 동일한 경험을 제공하며, 권한 체계를 통해 공개 범위를 제어한다.

### 1.2 대상 사용자

| 역할 | 설명 | 예상 행동 |
|------|------|----------|
| **관리자 (Admin)** | 회사 전체 운영자, 계정·팀 관리 | 회원 가입 승인, 권한 변경, 팀명 수정, 전사 공지 작성, 핀 고정 |
| **팀장 (Manager)** | 부서/팀 단위 리더 | 팀 일정 등록, 공지 작성, 핀 고정, 팀원 일정 조회 (팀/전사 공개 일정만 해당, **private 일정은 본인 외 조회 불가**) |
| **일반 직원 (Member)** | 일반 구성원 | 개인/팀 일정 등록, 공지 작성(핀 고정 제외), TO-DO 관리 |

### 1.3 핵심 기능 요약

- **캘린더**: 일/주/월 뷰, 작성자별·카테고리별 색상, 전사·팀·개인 공개 범위
- **공지 게시판**: 전사 공지 / 팀 공지, 중요도 핀 고정, 첨부파일. **전체 직원 작성 가능**, 핀 고정은 Manager/Admin만
- **개인 TO-DO**: 본인만 열람·관리 가능한 할 일 목록 (타인 공유 없음)
- **카카오톡 공유**: 일정 및 공지를 카카오톡 메시지 형식으로 포맷 후 공유 (UI 기본형, 실제 API 연결은 v2.0)
- **회원가입 및 권한 관리**: 이메일 기반 가입 시 팀명 직접 입력, 관리자 승인 후 활성화 및 팀 배정 수정 가능

### 1.4 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| UI 컴포넌트 | TweakCN (shadcn/ui 기반) |
| 백엔드/DB | Supabase (Auth, Database, RLS, Storage, Realtime) |
| 배포 | Vercel |
| 인증 | Supabase Auth (이메일/패스워드) |

### 1.5 제약조건

- 모바일 우선(Mobile-First) 반응형 — 스마트폰에서 일정 등록이 자연스러워야 함
- 초기 사용자 규모 기준: 최대 100명 이하 소규모 회사
- 카카오톡 공유는 v1.0에서 UI 목업 수준으로 구현 (실제 Kakao SDK 연동은 v2.0)
- 관리자가 직접 회원을 승인하는 방식 → 외부인 접근 차단
- **알림 기능 없음** — 웹 푸시·이메일 알림은 v2.0으로 이월. v1.0에서는 헤더 알림 아이콘 미포함
- 팀 구조 단순화 — 복잡한 팀 계층 없이 단일 팀 소속. 관리자 패널에서 팀명 및 소속 직접 수정

### 1.6 용어 정의

| 용어 | 의미 |
|------|------|
| **공개 범위** | 일정이 보여지는 대상: `전사(company)` / `팀(team)` / `개인(private)` |
| **카테고리** | 일정의 주제 분류 (회의, 출장, 휴가, 교육 등) — 색상 매핑의 기준 |
| **핀 고정** | 공지 게시판 최상단 고정 기능 |
| **TO-DO** | 개인 전용 할 일 목록, 타인에게 비공개 |

---

## 2. 페이지 목록 및 사용자 흐름

### 2.1 페이지 목록

| 경로 | 페이지명 | 설명 | 인증 필요 | 접근 권한 |
|------|--------|------|---------|---------|
| `/` | 랜딩/리다이렉트 | 로그인 여부에 따라 `/login` 또는 `/calendar`로 리다이렉트 | 불필요 | 전체 |
| `/login` | 로그인 | 이메일/패스워드 로그인 | 불필요 | 전체 |
| `/signup` | 회원가입 | 이메일, 이름, 부서 입력 후 관리자 승인 대기 | 불필요 | 전체 |
| `/pending` | 승인 대기 | 가입 후 관리자 승인 대기 안내 화면 | 불필요 | 전체 |
| `/calendar` | 캘린더 메인 | 일/주/월 뷰 캘린더 + 일정 CRUD | 필요 | Member 이상 |
| `/calendar/[id]` | 일정 상세 | 일정 상세 정보, 수정/삭제, 카카오톡 공유 버튼 | 필요 | Member 이상 |
| `/notices` | 공지 게시판 | 전사/팀 공지 목록 | 필요 | Member 이상 |
| `/notices/[id]` | 공지 상세 | 공지 본문, 첨부파일, 카카오톡 공유 버튼 | 필요 | Member 이상 |
| `/notices/new` | 공지 작성 | 공지 작성 폼 | 필요 | **Member 이상** (핀 고정 옵션은 Manager/Admin만 표시) |
| `/todo` | 개인 TO-DO | 개인 전용 할 일 목록 | 필요 | Member 이상 |
| `/admin` | 관리자 패널 | 회원 목록, 승인/권한 관리, **팀 생성·수정·소속 변경**, **카테고리 관리 탭** | 필요 | Admin 전용 |
| `/profile` | 프로필/설정 | 비밀번호 변경, 내 캘린더 색상 설정, 팀 정보 확인 | 필요 | Member 이상 |

### 2.2 사용자 흐름 다이어그램

```mermaid
flowchart TD
    A[사이트 접속] --> B{로그인 상태?}
    B -- 미로그인 --> C[/login]
    B -- 로그인됨 --> D{계정 상태?}
    D -- 승인 대기 --> E[/pending]
    D -- 활성화됨 --> F[/calendar]

    C --> G[로그인 성공] --> F
    C --> H[회원가입 링크] --> I[/signup]
    I --> J[가입 신청] --> E
    E --> K[관리자 승인] --> L[활성화 이메일 발송]

    F --> M[캘린더 뷰 선택: 일/주/월]
    F --> N[일정 클릭] --> O[/calendar/id]
    F --> P[+ 버튼] --> Q[일정 입력 모달]
    Q --> R{공개 범위 선택}
    R -- 전사 --> S[전체 직원에게 표시]
    R -- 팀 --> T[같은 팀에게만 표시]
    R -- 개인 --> U[본인만 표시]

    F --> V[게시판 탭] --> W[/notices]
    W --> X[공지 클릭] --> Y[/notices/id]
    Y --> Z[카카오톡 공유 버튼] --> AA[공유 포맷 미리보기]

    F --> AB[TO-DO 탭] --> AC[/todo]
```

### 2.3 인증/권한 분기

```
미인증 접근 → /login으로 리다이렉트
승인 대기 상태(pending) → /pending으로 리다이렉트
Member → 캘린더, 게시판 열람·작성(핀 고정 제외), TO-DO, 프로필
Manager → 위 + 공지 핀 고정, 팀원의 팀/전사 공개 일정 조회 (private 일정 조회 불가)
Admin → 위 + 회원 승인, 권한 변경, 팀명·소속 수정, 전체 일정/공지 관리
```

---

## 3. 데이터 모델 (Supabase)

> 테이블 프리픽스: `cg_` (Company Groupware)

### 3.1 테이블 목록

| 테이블명 | 설명 | Realtime | RLS |
|---------|------|---------|-----|
| `cg_profiles` | 사용자 프로필, 역할, 팀 소속 | ❌ | ✅ |
| `cg_teams` | 팀/부서 정보 (관리자가 생성·수정) | ❌ | ✅ |
| `cg_events` | 캘린더 일정 | ✅ | ✅ |
| `cg_event_categories` | 일정 카테고리 + 색상 | ❌ | ✅ |
| `cg_notices` | 공지 게시판 | ✅ | ✅ |
| `cg_notice_attachments` | 공지 첨부파일 | ❌ | ✅ |
| `cg_todos` | 개인 TO-DO (본인 전용) | ❌ | ✅ |

> **팀 구조 단순화**: `cg_team_members` (N:M 연결 테이블) 제거. 사용자는 하나의 팀에만 소속되며 `cg_profiles.team_id`로 직접 관리. 관리자가 `/admin`에서 팀명 및 소속 직접 수정.

### 3.2 핵심 테이블 스키마

#### `cg_profiles`
```
id            uuid (FK → auth.users.id)
full_name     text
team_id       uuid (FK → cg_teams.id) nullable  -- 관리자가 가입 승인 시 배정·수정
role          enum('admin', 'manager', 'member')
status        enum('pending', 'active', 'inactive')
color         text           -- 작성자 기본 색상 (#hex), 가입 시 12가지 팔레트에서 자동 배정
created_at    timestamptz
```

> **`department` 컬럼 제거**: 부서명 = 팀명으로 통합. 가입 시 입력한 부서명은 관리자 참고용으로 임시 저장 후 팀 배정 완료 시 폐기. UI에는 `cg_teams.name`만 표시.
>
> **회원가입 팀 배정 흐름**: 가입 폼에서 부서명(텍스트) 입력 → `pending` 상태로 저장 → Admin이 `/admin`에서 승인 시 해당 부서에 맞는 `team_id` 지정 (또는 신규 팀 생성) → 이후 관리자 패널에서 언제든 수정 가능 → 승인 알림은 관리자가 직원에게 **구두 통보**
>
> **최초 Admin 계정**: `seed.sql`에 admin 계정 직접 INSERT (Supabase 시드 방식)

#### `cg_events`
```
id            uuid PK
title         text
description   text nullable
start_at      timestamptz
end_at        timestamptz
is_all_day    boolean
location      text nullable
visibility    enum('company', 'team', 'private')
category_id   uuid (FK → cg_event_categories.id) nullable
created_by    uuid (FK → cg_profiles.id)
team_id       uuid (FK → cg_teams.id) nullable  -- visibility='team'일 때 사용
color         text nullable  -- 카테고리 색상 오버라이드
created_at    timestamptz
updated_at    timestamptz
```

#### `cg_notices`
```
id            uuid PK
title         text
content       text (HTML or Markdown)
visibility    enum('company', 'team')
team_id       uuid nullable
is_pinned     boolean default false
created_by    uuid (FK → cg_profiles.id)
created_at    timestamptz
updated_at    timestamptz
```

#### `cg_todos`
```
id            uuid PK
user_id       uuid (FK → cg_profiles.id)
title         text
is_done       boolean default false
due_date      date nullable
priority      enum('high', 'medium', 'low') default 'medium'
sort_order    integer
created_at    timestamptz
```

#### `cg_event_categories`
```
id            uuid PK
name          text  -- 예: 회의, 출장, 휴가, 교육, 기타
color         text  -- #hex 색상
is_default    boolean
created_by    uuid nullable  -- null=시스템 기본, admin_uuid=Admin이 생성
```

> **카테고리 관리**: Admin만 추가/수정/삭제 가능. `/admin` 페이지의 카테고리 관리 탭에서 처리.

### 3.3 색상 우선순위 규칙

```
1순위: cg_events.color (사용자가 개별 일정에 직접 지정)
2순위: cg_event_categories.color (카테고리별 색상)
3순위: cg_profiles.color (작성자 기본 색상)
4순위: 시스템 기본 색상 (#3B82F6)
```

### 3.4 RLS 정책 설계 원칙

```
cg_events:
  SELECT:
    visibility='company' → 전체 active 사용자
    visibility='team'    → 같은 팀원 (team_id 일치)
    visibility='private' → 본인만 (Manager 포함 타인 조회 불가, RLS 예외 없음)
  INSERT: 로그인된 active 사용자
  UPDATE/DELETE: 본인(created_by = auth.uid()) 또는 admin (수정+삭제 모두)

cg_notices:
  SELECT: visibility='company' → 전체, visibility='team' → 같은 팀원
  INSERT: 로그인된 active 사용자 전체 (Member 포함)
  UPDATE/DELETE: 본인 작성 공지(created_by = auth.uid()) 또는 admin (수정+삭제 모두)
  is_pinned 변경: manager 이상 또는 admin만 가능 (API 레벨에서 role 검증)

cg_todos:
  SELECT/INSERT/UPDATE/DELETE: 본인(user_id = auth.uid())만

기타 정책:
  inactive 사용자: middleware에서 로그인 차단. 기존 데이터(이벤트, 공지 등)는 유지되어 다른 팀원이 계속 열람 가능
  팀 변경 시: 사용자 team_id 변경 후 기존 visibility='team' 이벤트/공지의 team_id는 작성 시점 팀 기준으로 그대로 유지
```

---

## 4. UI/UX 방향

### 4.1 디자인 컨셉

**"클린 워크스페이스"** — Google Workspace / Notion 스타일에서 영감을 받되, 한국 소규모 기업 특성에 맞게 더 따뜻하고 가독성 높은 방향으로 구성한다.

| 항목 | 선택 | 근거 |
|------|------|------|
| **톤** | 미니멀/에디토리얼 + 밝고 기업적 | 매일 업무에서 쓰는 도구 → 눈 피로도 최소화 |
| **모드** | 라이트 모드 기본 (다크 모드 v2.0) | 소규모 기업 사용자 접근성 우선 |
| **언어** | 한국어 UI 기본 | 대상 사용자가 국내 기업 직원 |

### 4.2 컬러 토큰

```css
--primary:       #2563EB   /* 메인 블루 — 버튼, 링크, 강조 */
--primary-soft:  #EFF6FF   /* 배경 강조, 선택 상태 */
--accent:        #10B981   /* 성공, 완료 상태 */
--warning:       #F59E0B   /* 주의, 중요 공지 */
--danger:        #EF4444   /* 삭제, 에러 */
--text-primary:  #111827
--text-muted:    #6B7280
--border:        #E5E7EB
--background:    #F9FAFB
--surface:       #FFFFFF
```

### 4.3 이벤트 색상 팔레트 (카테고리/사용자별)

```
[카테고리 기본 색상]
회의:   #3B82F6  (파랑)
출장:   #8B5CF6  (보라)
휴가:   #10B981  (초록)
교육:   #F59E0B  (노랑)
행사:   #EF4444  (빨강)
기타:   #6B7280  (회색)

[사용자 색상 팔레트 — 고정 12가지]
#EF4444  #F97316  #EAB308  #22C55E
#10B981  #14B8A6  #3B82F6  #6366F1
#8B5CF6  #EC4899  #F43F5E  #64748B

사용자 색상: 가입 시 시스템이 12가지 팔레트에서 자동 배정, 프로필 페이지에서 변경 가능
프로필 아바타: 이니셜 + 배정된 색상의 원형 (이미지 업로드 없음)
```

### 4.4 레이아웃 구조

#### PC (≥768px)
```
┌─────────────────────────────────────────┐
│    헤더: 로고 | 탭 네비게이션 | 프로필     │
├──────────┬──────────────────────────────┤
│ 사이드바  │         메인 콘텐츠             │
│ - 미니    │  캘린더 / 게시판 / TO-DO       │
│   월간    │                               │
│   캘린더  │                               │
│ - 다가오는│                               │
│   3개 일정│                               │
│   (공개만)│                               │
└──────────┴──────────────────────────────┘
```

> **사이드바 다가오는 일정**: company + team 공개 일정만 표시 (private 제외). 최대 3개.

#### 모바일 (<768px)
```
┌─────────────────────┐
│   헤더: 로고 | 메뉴  │
├─────────────────────┤
│    메인 콘텐츠        │
│  (캘린더 / 게시판 /  │
│    TO-DO)           │
├─────────────────────┤
│ 하단 탭 바           │
│ 캘린더 | 공지 | TODO │
│ | 프로필             │
└─────────────────────┘
```

### 4.5 반응형 브레이크포인트

| 브레이크포인트 | 범위 | 레이아웃 변화 |
|-------------|------|-------------|
| `mobile` | < 768px | 하단 탭 바, **기본 탭: 캘린더**, **기본 캘린더 뷰: 월 뷰(month view)**, 모달 풀스크린 |
| `tablet` | 768px ~ 1024px | 사이드바 축소, 캘린더 주/월 뷰 |
| `desktop` | > 1024px | 사이드바 확장, 2-3 컬럼 레이아웃 |

### 4.6 TweakCN 커스터마이징 대상

| 컴포넌트 | 변경 방향 |
|---------|---------|
| `Button` | primary 색상 `--primary`로 통일, 라운딩 `rounded-lg` |
| `Card` | `border border-[--border]` + `shadow-sm`, hover 시 `shadow-md` 트랜지션 |
| `Badge` | 이벤트 카테고리 색상에 맞게 동적 배경색 적용 |
| `Dialog/Modal` | 모바일에서 bottom-sheet로 변환 |
| `Tabs` | 하단 탭 바 전용 variant 추가 |
| `Calendar` | 외부 라이브러리(`react-big-calendar` 또는 자체 구현) + TweakCN 스타일링 오버라이드 |
| `Avatar` | 사용자 색상 기반 이니셜 아바타 지원 |

### 4.7 캘린더 컴포넌트 전략

- **라이브러리**: `react-big-calendar` 또는 `@fullcalendar/react` 중 선택
  - 권장: `@fullcalendar/react` (일/주/월 뷰 내장, 모바일 대응 우수)
- **커스터마이징**: TweakCN 토큰 기반으로 이벤트 색상, 뷰 헤더 스타일 오버라이드
- **일정 입력 모달**: shadcn `Dialog` 기반으로 구글 캘린더와 유사한 폼 구조
- **빈 슬롯 클릭**: 캘린더 빈 날짜/시간 슬롯 클릭 시 해당 날짜·시간이 자동 입력된 일정 생성 모달 즉시 오픈 (Google Calendar 방식)
- **일정 충돌 감지**: 없음 — 동일 시간대 중복 일정 자유 등록 허용

### 4.8 애니메이션/인터랙션 방향

- 페이지 전환: `opacity + translateY` 페이드인 (Framer Motion 또는 CSS)
- 일정 클릭: 카드 팝오버 → 상세 슬라이드 패널 (PC) / 바텀시트 (모바일)
- TO-DO 완료: 체크 시 취소선 + 페이드아웃
- 공지 핀 고정: 목록 최상단 이동 애니메이션

### 4.9 공지 게시판 UX 상세

| 항목 | 결정 내용 |
|------|-----------|
| 탭 구조 | **'전체 공지 \| 팀 공지'** 2개 탭 |
| 페이지네이션 | **무한 스크롤** |
| 핀 고정 제한 | 전사 공지 최대 **3개** + 팀 공지 팀별 최대 **3개** (각 독립 적용) |
| 검색 | 공지 목록 내 **제목 기반 텍스트 검색** (ilike 쿼리) |
| 첨부파일 | 공지당 최대 **3개**, 파일당 **10MB**, 허용 형식: **이미지/PDF/Office** |
| 카카오톡 공유 | **공지 + 일정 모두** 상세 페이지에 공유 버튼 (포맷: 제목 + 내용 요약 + 링크) |

### 4.10 에디터 사양

| 대상 | 에디터 종류 | 기능 범위 |
|------|-----------|---------|
| 공지 본문 | **Tiptap** 리치 텍스트 | Bold / Italic / 순서 없는 리스트 / 이미지 인라인 업로드 (Supabase Storage) |
| 이벤트 설명란 | 일반 `<textarea>` | 리치 텍스트 불필요, 단순 텍스트 입력 |

### 4.11 TO-DO 정렬

- **드래그 & 드롭**으로 항목 순서 변경 (`cg_todos.sort_order` 필드 활용)
- 완료된 항목은 목록 하단 자동 이동 (시각적 구분)

### 4.12 사용자 관련 UX

| 항목 | 결정 내용 |
|------|-----------|
| 비밀번호 재설정 | 이메일 초기화 없음. **Admin에게 직접 문의** (Admin이 수동 처리) |
| 다른 직원 프로필 조회 | 이름 + 역할 + 팀 정보만 표시하는 **미니 팝오버** |
| 복수 Admin | **허용** — Admin이 다른 사용자에게 Admin 역할 부여 가능 |
| 승인 알림 | 시스템 알림 없음. **관리자가 직접 직원에게 구두 통보** |

---

## 5. 구현 스펙

### 5.1 폴더 구조

```
/company-groupware
  ├── CLAUDE.md                          # 메인 에이전트 지침
  ├── .claude/
  │   ├── agents/
  │   │   ├── db-architect/
  │   │   │   └── AGENT.md               # Supabase 스키마, RLS 정책 전문
  │   │   ├── api-designer/
  │   │   │   └── AGENT.md               # Route Handler, Server Action 전문
  │   │   └── ui-builder/
  │   │       └── AGENT.md               # 컴포넌트, 페이지 UI 전문
  │   └── skills/
  │       ├── calendar-view/
  │       │   ├── SKILL.md               # FullCalendar 설정, 뷰 전환 로직
  │       │   └── references/
  │       │       └── fullcalendar-guide.md
  │       ├── color-token/
  │       │   └── SKILL.md               # 이벤트 색상 우선순위 계산 유틸
  │       └── kakao-share/
  │           ├── SKILL.md               # 카카오톡 공유 포맷 생성 (v1.0: UI only)
  │           └── references/
  │               └── kakao-sdk-guide.md # v2.0 연동 참고용
  ├── app/
  │   ├── (public)/
  │   │   ├── login/
  │   │   │   └── page.tsx
  │   │   ├── signup/
  │   │   │   └── page.tsx
  │   │   └── pending/
  │   │       └── page.tsx
  │   ├── (app)/                         # 인증 필요 라우트 그룹
  │   │   ├── layout.tsx                 # 앱 공통 레이아웃 (헤더, 사이드바, 하단탭)
  │   │   ├── calendar/
  │   │   │   ├── page.tsx               # 캘린더 메인 (일/주/월 뷰)
  │   │   │   └── [id]/
  │   │   │       └── page.tsx           # 일정 상세
  │   │   ├── notices/
  │   │   │   ├── page.tsx               # 게시판 목록
  │   │   │   ├── new/
  │   │   │   │   └── page.tsx           # 공지 작성
  │   │   │   └── [id]/
  │   │   │       └── page.tsx           # 공지 상세
  │   │   ├── todo/
  │   │   │   └── page.tsx               # 개인 TO-DO
  │   │   └── profile/
  │   │       └── page.tsx               # 프로필/설정
  │   ├── admin/
  │   │   └── page.tsx                   # 관리자 패널 (Admin 전용)
  │   ├── api/
  │   │   ├── events/
  │   │   │   └── route.ts               # 일정 CRUD
  │   │   ├── notices/
  │   │   │   └── route.ts               # 공지 CRUD (전체 active 사용자 작성 가능, 핀 고정은 role 검증)
  │   │   ├── todos/
  │   │   │   └── route.ts               # TO-DO CRUD (본인 전용, RLS 적용)
  │   │   ├── admin/
  │   │   │   ├── users/
  │   │   │   │   └── route.ts           # 사용자 승인, 권한 변경, 팀 소속 배정
  │   │   │   └── teams/
  │   │   │       └── route.ts           # 팀 생성, 팀명 수정, 팀 삭제
  │   │   └── share/
  │   │       └── kakao/
  │   │           └── route.ts           # 카카오톡 공유 포맷 생성 API
  │   ├── layout.tsx
  │   └── page.tsx                       # 루트 (로그인 상태에 따라 리다이렉트)
  ├── components/
  │   ├── ui/                            # TweakCN 기본 컴포넌트
  │   ├── calendar/
  │   │   ├── CalendarMain.tsx           # FullCalendar 래퍼
  │   │   ├── EventModal.tsx             # 일정 입력/수정 모달
  │   │   ├── EventDetailPanel.tsx       # 일정 상세 (PC: 사이드패널, 모바일: 바텀시트)
  │   │   ├── ViewToggle.tsx             # 일/주/월 뷰 전환 버튼
  │   │   └── EventColorBadge.tsx        # 색상 배지
  │   ├── notices/
  │   │   ├── NoticeList.tsx             # 공지 목록
  │   │   ├── NoticeCard.tsx             # 공지 카드 아이템
  │   │   ├── NoticeEditor.tsx           # 공지 작성/수정 폼
  │   │   └── PinButton.tsx              # 핀 고정 버튼
  │   ├── todo/
  │   │   ├── TodoList.tsx               # TO-DO 목록
  │   │   ├── TodoItem.tsx               # TO-DO 단일 아이템 (체크, 삭제)
  │   │   └── TodoAddForm.tsx            # 빠른 추가 폼
  │   ├── share/
  │   │   └── KakaoShareModal.tsx        # 카카오톡 공유 미리보기 모달
  │   ├── layout/
  │   │   ├── AppHeader.tsx              # 헤더
  │   │   ├── Sidebar.tsx                # PC 사이드바
  │   │   └── BottomTabBar.tsx           # 모바일 하단 탭 바
  │   └── admin/
  │       ├── UserTable.tsx              # 회원 목록 테이블 (승인 대기 탭 / 전체 탭)
  │       ├── UserApproveModal.tsx       # 승인 시 팀 배정 모달
  │       ├── TeamManager.tsx            # 팀 목록 + 팀명 수정 + 신규 팀 생성
  │       ├── CategoryManager.tsx        # 카테고리 목록 + 추가/수정/삭제 (Admin 전용)
  │       └── RoleBadge.tsx              # 역할 배지
  ├── lib/
  │   ├── supabase/
  │   │   ├── client.ts                  # 브라우저 클라이언트
  │   │   ├── server.ts                  # 서버 클라이언트
  │   │   └── queries/
  │   │       ├── events.ts              # 일정 쿼리
  │   │       ├── notices.ts             # 공지 쿼리
  │   │       ├── todos.ts               # TO-DO 쿼리
  │   │       ├── profiles.ts            # 프로필 쿼리
  │   │       └── teams.ts               # 팀 쿼리 (팀 목록, 소속 변경)
  │   └── utils/
  │       ├── eventColor.ts              # 이벤트 색상 우선순위 계산
  │       ├── dateFormat.ts              # 날짜 포맷 유틸 (한국어)
  │       └── kakaoFormat.ts             # 카카오톡 공유 텍스트 포맷터
  ├── types/
  │   ├── database.ts                    # Supabase 자동 생성 타입
  │   └── app.ts                         # 앱 전용 타입 (Event, Notice, Todo 등)
  ├── middleware.ts                      # 인증 상태에 따른 라우트 보호
  ├── output/                            # 에이전트 중간 산출물
  │   ├── step1_schema.sql
  │   ├── step2_rls_policies.sql
  │   └── step3_seed_data.sql
  ├── supabase/
  │   └── seed.sql                       # 최초 Admin 계정 + 기본 카테고리 INSERT
  └── docs/
      ├── references/
      │   └── fullcalendar-guide.md
      └── domain/
          └── schema.md                  # ERD 및 스키마 문서
```

### 5.2 에이전트 구조

**서브에이전트 분리** 방식 채택 — 페이지 수가 많고 DB/UI/API 역할이 명확히 구분되기 때문

#### 메인 오케스트레이터 (CLAUDE.md)

| 역할 | 내용 |
|------|------|
| 전체 구현 순서 관리 | DB → API → UI 순으로 서브에이전트 호출 |
| 중간 산출물 관리 | `/output/` 디렉터리에 SQL, 타입 파일 저장 후 다음 에이전트에 전달 |
| 최종 통합 검증 | 빌드 오류, 타입 오류, RLS 정책 적용 확인 |

#### 서브에이전트 목록

| 서브에이전트 | 역할 | 트리거 조건 | 입력 | 출력 |
|------------|------|-----------|------|------|
| `db-architect` | Supabase 스키마 생성, RLS 정책 작성, 마이그레이션 실행 | 초기 DB 셋업 및 스키마 변경 시 | 설계서 섹션 3 (데이터 모델) | `/output/step1_schema.sql`, `step2_rls_policies.sql`, `types/database.ts` |
| `api-designer` | Route Handler 및 Server Action 작성, Supabase 쿼리 함수 구현 | 백엔드 로직 구현 시 | `types/database.ts`, API 명세 | `app/api/**/*.ts`, `lib/supabase/queries/*.ts` |
| `ui-builder` | 페이지 및 컴포넌트 구현, TweakCN 커스터마이징 | 새 페이지/컴포넌트 구현 시 | API 인터페이스, 설계서 섹션 4 (UI/UX) | `app/(app)/**/*.tsx`, `components/**/*.tsx` |

#### 구현 순서

```
1단계: db-architect
  → cg_teams, cg_profiles (department 컬럼 없음), cg_events, cg_event_categories,
    cg_notices, cg_notice_attachments, cg_todos 총 7개 테이블 생성
  → RLS 정책 적용
    - events: private는 본인만 (Manager 예외 없음), UPDATE/DELETE는 본인 또는 admin
    - notices: 전체 active 사용자 INSERT, UPDATE/DELETE는 본인 또는 admin, pin은 API 레벨 검증
    - inactive 사용자 middleware 차단 (데이터 유지)
  → supabase/seed.sql 작성 (최초 Admin 계정 INSERT + 기본 카테고리 6개)
  → database.ts 타입 생성

2단계: api-designer
  → Supabase 쿼리 함수 (events, notices, todos, profiles, teams, categories)
  → Route Handlers (CRUD + 팀 관리 + 카테고리 관리(Admin 전용) + 카카오 공유 포맷)
  → notices API: is_pinned 변경 시 role 검증 로직 포함, 핀 제한(전사 3개/팀 3개) 검증
  → middleware.ts (인증, pending/inactive 상태 라우트 보호)

3단계: ui-builder (병렬 가능)
  → 공통 레이아웃 (헤더-알림 없음, 사이드바-다가오는 3개 공개 일정, 하단탭-기본: 캘린더)
  → 인증 페이지 (로그인, 회원가입-부서명 입력, 승인대기)
  → 캘린더 메인 (모바일 기본: 월 뷰) + 일정 입력 모달 (빈 슬롯 클릭 시 날짜 자동 입력)
  → 공지 게시판 (전체/팀 탭, 무한 스크롤, 검색, 핀 제한) + 상세 (카카오 공유 버튼) + 작성 (Tiptap 에디터 + 첨부파일)
  → TO-DO 페이지 (개인 전용, 드래그&드롭 순서 변경)
  → 관리자 패널 (회원 승인 + 팀 배정 모달, 팀 관리 탭, 카테고리 관리 탭)
  → 카카오톡 공유 모달 (공지/이벤트 공통)
  → 미니 프로필 팝오버 (이름+역할+팀)
```

### 5.3 스킬 목록

| 스킬명 | 역할 | 트리거 조건 |
|-------|------|-----------|
| `calendar-view` | FullCalendar 설정, 일/주/월 뷰 커스터마이징, 이벤트 렌더링 | 캘린더 컴포넌트 구현 시 |
| `color-token` | 이벤트 색상 우선순위(카테고리→작성자→기본) 계산 함수 | 이벤트 표시 색상 결정 시 |
| `kakao-share` | 일정/공지 카카오톡 공유 텍스트 포맷 생성 (v1.0: 클립보드 복사 UI) | 공유 버튼 구현 시 |

### 5.4 환경 변수

| 변수명 | 용도 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 (RLS 적용) |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자 전용 서버사이드 쿼리 |
| `NEXT_PUBLIC_APP_URL` | 배포 도메인 (카카오 공유 링크 생성용) |
| `KAKAO_JAVASCRIPT_KEY` | 카카오 SDK 키 (v2.0 연동 시 활성화) |

---

## 6. 워크플로우 상세

### 6.1 데이터 흐름

```
[캘린더 일정 등록]
사용자 입력 (EventModal — 빈 슬롯 클릭 시 날짜/시간 자동 입력)
  → 공개 범위 선택 (company/team/private)
  → 일정 충돌 감지 없음 — 중복 시간 자유 등록
  → POST /api/events
  → Supabase INSERT (RLS: 본인 소유)
  → Realtime 구독으로 다른 사용자 캘린더에 실시간 반영
  → 카카오톡 공유 버튼 클릭 시 → GET /api/share/kakao?event_id=xxx
    → 포맷 텍스트 생성 → 클립보드 복사 or 카카오 SDK 호출 (v2.0)

[공지 등록]
active 사용자 누구나 /notices/new 작성 가능 (Tiptap 에디터 사용)
  → POST /api/notices
  → is_pinned 옵션: Manager/Admin만 UI에서 표시되며 API에서 role 검증
  → is_pinned: true → 핀 제한 검증 (전사 공지 ≤3개, 팀 공지 해당 팀 ≤3개) → 목록 최상단 고정
  → 팀 범위 공지: team_id 필수 (작성자의 team_id 자동 설정)
  → 첨부파일: 최대 3개, 파일당 10MB (이미지/PDF/Office), Supabase Storage 업로드

[회원 가입 승인 흐름]
신규 가입 → 이름·이메일·부서명(텍스트) 입력 → cg_profiles.status = 'pending' (department 임시 저장)
  → Admin이 /admin에서 승인 클릭
  → 부서명 참고하여 기존 팀 선택 또는 신규 팀 생성 후 team_id 배정
  → PATCH /api/admin/users/:id { status: 'active', role: 'member', team_id: '...' }
  → 활성화 완료 (이메일 알림 없음 — 관리자가 직원에게 구두 통보)

[사용자 팀 변경 시]
Admin이 /admin에서 사용자 team_id 변경
  → cg_profiles.team_id 업데이트
  → 기존 visibility='team' 이벤트/공지의 team_id는 그대로 유지 (작성 시점 팀 기준)
  → 변경 후 사용자는 새 팀의 team 범위 콘텐츠만 조회

[최초 Admin 계정 생성]
supabase/seed.sql 실행 → admin 계정 auth.users + cg_profiles INSERT
  → 해당 계정으로 로그인 후 나머지 사용자 승인/관리 시작

[inactive 사용자 처리]
Admin이 사용자 status → 'inactive' 변경
  → middleware에서 해당 계정 로그인 차단 (/login 리다이렉트)
  → 기존 데이터(이벤트, 공지 등)는 유지 — 다른 팀원이 계속 열람 가능
```

### 6.2 카카오톡 공유 v1.0 구현 방식

v1.0에서는 Kakao SDK를 실제로 연동하지 않고, 공유 포맷 텍스트를 생성하여 클립보드에 복사하는 방식으로 구현한다. **공지 상세 + 일정 상세 모두** 공유 버튼 제공.

```
공유 버튼 클릭 (공지 또는 일정 상세 페이지)
  → KakaoShareModal 오픈
  → 포맷된 텍스트 미리보기 표시

  [일정 포맷]
    📅 [카테고리] 일정 제목
    ⏰ 2025.08.15 (목) 14:00 ~ 16:00
    📍 장소 (있을 경우)
    👤 작성자명
    🔗 https://앱도메인/calendar/이벤트ID

  [공지 포맷]
    📢 공지 제목
    ✏️ 내용 요약 (최대 100자 미리보기)
    👤 작성자명
    🔗 https://앱도메인/notices/공지ID

  → "클립보드 복사" 버튼 → navigator.clipboard.writeText()
  → 복사 완료 토스트 표시
  → (v2.0) Kakao.Share.sendDefault() 연동
```

---

## 7. 검증 기준

### 7.1 단계별 성공 기준

| 단계 | 성공 기준 | 검증 방법 | 실패 처리 |
|------|---------|---------|---------|
| DB 셋업 | 테이블 7개 생성(`department` 컬럼 없음), RLS 정책 적용, seed.sql 실행 완료, 타입 생성 오류 없음 | TypeScript 오류 없음, Supabase 대시보드 확인 | 자동 재시도 (최대 3회) |
| 인증 흐름 | 로그인/가입/승인 대기 흐름 완전 동작, inactive 계정 로그인 차단 | 실제 브라우저 테스트 (role별) | 에스컬레이션 |
| 팀 배정 | 관리자 패널에서 신규 팀 생성, 사용자 소속 변경 정상 동작. 팀 변경 후 기존 team 범위 데이터 team_id 유지 확인 | 수동 테스트 | 에스컬레이션 |
| 캘린더 | 일/주/월 뷰 전환, 빈 슬롯 클릭 시 날짜 자동 입력 모달, 일정 CRUD, 색상 표시 정상 | 브라우저 렌더링 확인 | 자동 재시도 |
| RLS — private 이벤트 | private 이벤트는 본인만 조회, Manager도 타인 private 조회 불가 | Supabase 정책 테스트 쿼리 (Manager 계정으로 타인 private 이벤트 SELECT → 0건) | 에스컬레이션 |
| 공지 권한 | Member 작성 가능, 핀 고정은 Manager/Admin만 노출·동작, 핀 제한(전사 3개/팀 3개) 초과 시 오류 | role별 시나리오 수동 테스트 | 에스컬레이션 |
| 공지 에디터 | Tiptap Bold/Italic/리스트/이미지 업로드 정상 동작 | 수동 테스트 | 에스컬레이션 |
| TO-DO 격리 | 본인 TO-DO만 조회 가능, 타인 접근 시 빈 목록 반환, 드래그&드롭 순서 변경 반영 | RLS 정책 테스트 쿼리 + 수동 테스트 | 에스컬레이션 |
| RLS 전체 | 권한 밖 데이터 접근 차단 (팀 일정, 개인 일정, TO-DO), Admin 타인 이벤트/공지 수정+삭제 가능 | Supabase 정책 테스트 쿼리 | 에스컬레이션 |
| 카테고리 관리 | Admin만 카테고리 추가/수정/삭제 가능, 비Admin 접근 시 차단 | role별 수동 테스트 | 에스컬레이션 |
| 반응형 | 모바일(375px) 기본 월 뷰 + 캘린더 탭, 태블릿(768px), 데스크톱(1280px) 레이아웃 정상 | Lighthouse 모바일 ≥ 85 | 폴백 UI + 에스컬레이션 |
| 공유 기능 | 공지/이벤트 모두 카카오 포맷 텍스트 생성 및 클립보드 복사 동작 | 수동 테스트 | 폴백 UI (텍스트만 표시) |

---

## 8. v2.0 이월 기능

다음 기능은 v1.1 범위에서 제외하고 v2.0에서 구현한다.

| 기능 | 비고 |
|------|------|
| 카카오톡 SDK 실제 연동 (Kakao.Share) | v1.1에서 클립보드 복사 UI로 대체 |
| 웹 푸시 알림 / 이메일 알림 | 웹페이지 특성상 구현 복잡도 높음 |
| 다크 모드 | 라이트 모드 안정화 후 추가 |
| 반복 일정 (매주, 매월 등) | 캘린더 데이터 모델 확장 필요 |
| Google Calendar 동기화 | OAuth 연동 필요 |
| 캘린더 iCal 내보내기 | 파일 생성 로직 추가 필요 |
| 공지 댓글 / 좋아요 | 테이블 추가 필요 |
| 다중 팀 소속 | 현재 단일 팀만 허용 |
| 모바일 앱 (PWA 또는 React Native) | v1.1 웹 안정화 후 검토 |

---

## 9. 참고 자료

| 분류 | 내용 | 경로/링크 |
|------|------|---------|
| 캘린더 라이브러리 | FullCalendar React 공식 문서 | https://fullcalendar.io/docs/react |
| UI 레퍼런스 | Google Calendar (일/주/월 뷰 UX 참고) | - |
| UI 레퍼런스 | Notion (사이드바, 미니멀 레이아웃 참고) | - |
| Supabase | Auth + RLS 공식 가이드 | https://supabase.com/docs/guides/auth |
| 카카오 공유 | Kakao JavaScript SDK (v2.0 준비) | https://developers.kakao.com/docs/latest/ko/message/js-link |
| TweakCN | 컴포넌트 커스터마이징 | https://tweakcn.com |
| 도메인 스키마 | ERD 상세 문서 | `/docs/domain/schema.md` (구현 중 생성) |
