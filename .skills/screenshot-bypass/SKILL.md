# 스킬: screenshot-bypass

## 트리거 조건
- Puppeteer 스크린샷 촬영 시 로그인 페이지로 리다이렉트되는 문제
- 미들웨어 / 서버 컴포넌트 이중 인증 우회가 필요한 경우
- `capture-screens.mjs` 인증 오류 디버깅

## 개요
Supabase Auth 비밀번호 없이 개발 환경에서만 magic link를 발급해
Puppeteer가 인증된 앱 화면을 촬영할 수 있게 하는 개발 전용 우회 방식.

---

## 🚀 실행 전 사용자 확인 사항 (Pre-flight Checklist)

> **이 스킬을 실행하기 전에 아래 항목을 반드시 직접 확인하세요.**
> Claude가 자동으로 처리할 수 없는 사용자 액션 목록입니다.

### 1단계 — `.env.local` 설정 확인

| 변수 | 확인 방법 | 비고 |
|------|-----------|------|
| `SCREENSHOT_SECRET` | `.env.local`에 임의 문자열 입력 여부 확인 | 예: `dev-screenshot-secret-2026` |
| `SCREENSHOT_USER_ID` | Supabase 대시보드 → Authentication → Users → admin 계정 UUID 복사 후 입력 | 예: `d13d4903-xxxx-...` |
| `NEXT_PUBLIC_APP_URL` | **개발 서버 포트와 반드시 일치해야 함** | `npm run dev` 실행 후 표시되는 포트 확인 |
| `SUPABASE_SERVICE_ROLE_KEY` | anon key가 아닌 **service_role key** 입력 여부 확인 | 대시보드 → Settings → API → `service_role` 항목 |

> ⚠️ `NEXT_PUBLIC_APP_URL`과 실제 서버 포트 불일치가 가장 흔한 실패 원인입니다.
> magic link가 `localhost:3000`으로 redirect되면 서버가 `3001`에서 실행 중이더라도 세션이 수립되지 않습니다.

### 2단계 — Supabase service_role key 구분 방법

JWT 페이로드의 `role` 값으로 구분합니다:
```
anon key:         eyJ...  → {"role":"anon", ...}       ← ❌ 사용 불가
service_role key: eyJ...  → {"role":"service_role", ...} ← ✅ 필요한 키
```
[jwt.io](https://jwt.io)에서 키를 붙여넣어 `role` 필드 확인 가능.

### 3단계 — 개발 서버 실행

```bash
npm run dev
# 출력 예: ▲ Next.js 15.x.x  Local: http://localhost:3001
# ↑ 이 포트 번호를 NEXT_PUBLIC_APP_URL에 반영
```

### 4단계 — 확인 완료 후 실행

```bash
# 별도 터미널에서 실행
node scripts/capture-screens.mjs
```

---

## 전제 조건
1. `NODE_ENV=development` (개발 서버 실행 중)
2. `.env.local`에 두 변수 설정:
   - `SCREENSHOT_SECRET` — 임의 문자열 (엔드포인트 접근 토큰) ✅ 완료
   - `SCREENSHOT_USER_ID` — Supabase 대시보드 → Authentication → Users → admin UUID ✅ 완료
3. Next.js 개발 서버 실행 중 (`npm run dev`)

## 동작 흐름
```
capture-screens.mjs
  └─ POST /api/dev/session  { secret, userId }
       └─ 3중 보안 검사 (NODE_ENV / host / secret)
       └─ supabase.auth.admin.getUserById(userId)  → 이메일 조회
       └─ supabase.auth.admin.generateLink({ type:'magiclink', email, redirectTo: APP_URL/calendar })
       └─ { action_link } 반환
  └─ Puppeteer → action_link 방문
       └─ Supabase 검증 → APP_URL/calendar#access_token=... 으로 리다이렉트
       └─ 브라우저 JS가 hash 토큰 처리 → 세션 쿠키 수립
  └─ 각 페이지 순서대로 캡처
```

> ⚠️ **현재 테스트 중**: magic link 방문 후 세션 수립 전에 미들웨어가 `/login`으로 리다이렉트하는 타이밍 문제 존재.
> `NEXT_PUBLIC_APP_URL`이 실제 서버 포트와 일치해야 하며, 세션 수립 대기 시간 조정이 필요할 수 있음.

## 관련 파일
| 파일 | 역할 |
|------|------|
| `app/api/dev/session/route.ts` | 세션 발급 엔드포인트 |
| `middleware.ts` | `api/dev` 경로 미들웨어 제외 |
| `scripts/capture-screens.mjs` | 인증 블록 (세션 API 호출) |
| `.env.local` | `SCREENSHOT_SECRET`, `SCREENSHOT_USER_ID` |

## 보안 체크리스트
- [x] `NODE_ENV !== 'development'` → 즉시 404 반환 (프로덕션 차단)
- [x] `host` 헤더 검증 → localhost / 127.0.0.1 외 403
- [x] `SCREENSHOT_SECRET` 불일치 → 401
- [x] `.env.local`에만 존재, Vercel 환경변수 미적용
- [x] 기존 앱 코드 영향 없음 (middleware 1줄 수정 외)

## 사용법
```bash
# 1. .env.local에서 SCREENSHOT_USER_ID 설정 확인
# 2. Next.js 개발 서버 실행
npm run dev

# 3. 별도 터미널에서 스크린샷 촬영
node scripts/capture-screens.mjs

# 4. PPT 생성
node scripts/generate-ppt.mjs
```

## 검증 방법
1. `node scripts/capture-screens.mjs` → `scripts/screenshots/*.png` 생성 확인
2. 각 PNG가 로그인 페이지가 아닌 실제 앱 화면인지 확인
3. 보안 검증: `NODE_ENV=production node scripts/capture-screens.mjs` → 세션 발급 실패 확인

---

## ⚠️ 알려진 문제 및 향후 개선 사항

> 현재 magic link 방식은 타이밍 문제로 인해 인증된 화면 촬영이 불안정합니다.
> 아래 항목을 개선하면 안정적으로 동작할 수 있습니다.

### 문제 1 — magic link 세션 수립 타이밍

magic link 방문 후 브라우저 JS가 세션 쿠키를 쓰기 전에 다음 `page.goto()`가 호출되면 미들웨어에 의해 `/login`으로 리다이렉트됨.

**해결 방향**:
- `capture-screens.mjs`에서 magic link 방문 후 URL이 `#access_token`을 포함하지 않을 때까지 대기
- 또는 `/calendar` 페이지 로드 후 실제 캘린더 DOM 요소가 나타날 때까지 `waitForSelector` 사용

### 문제 2 — UUID 직접 입력 번거로움

앱마다 매번 UUID를 조회·입력해야 하는 불편함.

**해결 방향**: `SCREENSHOT_USER_ID` 대신 이메일로 조회하도록 API 개선:
```typescript
// route.ts — userId 대신 email로 받아 내부에서 조회
const { data: { users } } = await supabase.auth.admin.listUsers()
const user = users.find(u => u.email === email)
```
→ `.env.local`에 `SCREENSHOT_EMAIL`만 입력하면 UUID 조회 불필요
