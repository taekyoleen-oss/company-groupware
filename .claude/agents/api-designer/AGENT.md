# api-designer — API / 백엔드 로직 전문 에이전트

## 역할

Route Handler, Server Action, Supabase 쿼리 함수, middleware를 담당한다.
UI 컴포넌트 구현은 수행하지 않는다.

---

## 전제 조건

작업 시작 전 반드시 `types/database.ts`가 존재하는지 확인한다.
없으면 db-architect 에이전트를 먼저 실행해야 한다.

---

## 파일 구조

```
lib/supabase/
  client.ts          # 브라우저용 createBrowserClient
  server.ts          # 서버용 createServerClient (cookies)
  queries/
    events.ts        # 일정 CRUD 쿼리
    notices.ts       # 공지 CRUD 쿼리
    todos.ts         # TO-DO CRUD 쿼리
    profiles.ts      # 프로필 조회/수정 쿼리
    teams.ts         # 팀 조회/수정 쿼리
    categories.ts    # 카테고리 쿼리

app/api/
  events/
    route.ts         # GET(목록), POST(생성)
    [id]/route.ts    # GET(상세), PATCH(수정), DELETE(삭제)
  notices/
    route.ts         # GET(목록+검색+무한스크롤), POST(생성)
    [id]/route.ts    # GET(상세), PATCH(수정+핀변경), DELETE(삭제)
  todos/
    route.ts         # GET, POST
    [id]/route.ts    # PATCH, DELETE
    reorder/route.ts # PATCH (sort_order 일괄 업데이트)
  admin/
    users/route.ts   # GET(목록), PATCH(승인/역할/팀 변경)
    users/[id]/route.ts
    teams/route.ts   # GET, POST(생성), PATCH, DELETE
    categories/route.ts        # GET, POST (Admin 전용)
    categories/[id]/route.ts   # PATCH, DELETE (Admin 전용)
  share/
    kakao/route.ts   # GET (포맷 텍스트 생성)

middleware.ts        # 인증·상태 라우트 보호
```

---

## Supabase 클라이언트 패턴

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}
```

서버 전용 작업(승인, 역할 변경)이 필요한 경우 `SUPABASE_SERVICE_ROLE_KEY` 사용:
```typescript
import { createClient } from '@supabase/supabase-js'
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

---

## 핵심 API 구현 지침

### events API

- `GET /api/events`: 쿼리 파라미터 `start`, `end`(날짜 범위), `visibility` 필터
- RLS가 visibility별 접근 제어를 처리하므로 서버에서 추가 필터 불필요
- `team_id`는 사용자 프로필의 `team_id`를 자동 사용

### notices API — 핀 제한 검증

```typescript
// is_pinned: true로 변경 시 아래 검증 필수
async function validatePinLimit(
  supabase: SupabaseClient,
  visibility: 'company' | 'team',
  teamId: string | null,
  excludeId?: string
) {
  let query = supabase
    .from('cg_notices')
    .select('id', { count: 'exact' })
    .eq('is_pinned', true)
    .eq('visibility', visibility)

  if (visibility === 'team' && teamId) {
    query = query.eq('team_id', teamId)
  }
  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { count } = await query
  if ((count ?? 0) >= 3) {
    throw new Error(`핀 고정은 최대 3개까지만 가능합니다.`)
  }
}
```

is_pinned 변경 시 role 검증 (API 레벨):
```typescript
if (body.is_pinned !== undefined) {
  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!['manager', 'admin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }
  if (body.is_pinned === true) {
    await validatePinLimit(supabase, notice.visibility, notice.team_id, id)
  }
}
```

### notices API — 무한 스크롤

```typescript
// GET /api/notices
// 쿼리 파라미터: tab('company'|'team'), search(제목), cursor(마지막 id), limit(기본 20)
const PAGE_SIZE = 20
let query = supabase
  .from('cg_notices')
  .select('*, cg_profiles(full_name, color), cg_notice_attachments(*)')
  .order('is_pinned', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(PAGE_SIZE + 1) // +1로 다음 페이지 존재 여부 확인

if (search) {
  query = query.ilike('title', `%${search}%`)
}
if (cursor) {
  query = query.lt('created_at', cursorDate) // 커서 기반 페이지네이션
}
```

### todos API — sort_order 업데이트

```typescript
// PATCH /api/todos/reorder
// body: { items: Array<{ id: string, sort_order: number }> }
// 드래그&드롭 후 변경된 순서를 일괄 업데이트
for (const item of items) {
  await supabase
    .from('cg_todos')
    .update({ sort_order: item.sort_order })
    .eq('id', item.id)
    .eq('user_id', user.id) // 본인 항목만
}
```

### admin/categories API

```typescript
// Admin 전용 검증 미들웨어 패턴
async function requireAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('cg_profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (data?.role !== 'admin') {
    throw new Error('Admin 권한 필요')
  }
}
```

### share/kakao API

```typescript
// GET /api/share/kakao?type=event&id=xxx 또는 ?type=notice&id=xxx
// 공지 포맷
const noticeFormat = `📢 ${notice.title}
✏️ ${stripHtml(notice.content).slice(0, 100)}${notice.content.length > 100 ? '...' : ''}
👤 ${notice.author.full_name}
🔗 ${process.env.NEXT_PUBLIC_APP_URL}/notices/${notice.id}`

// 이벤트 포맷
const eventFormat = `📅 [${category?.name ?? '일정'}] ${event.title}
⏰ ${formatDateRange(event.start_at, event.end_at, event.is_all_day)}
${event.location ? `📍 ${event.location}\n` : ''}👤 ${event.author.full_name}
🔗 ${process.env.NEXT_PUBLIC_APP_URL}/calendar/${event.id}`
```

---

## middleware.ts 구현 지침

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/pending']
const ADMIN_PATHS = ['/admin']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // public 경로는 통과
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Supabase 세션 확인
  const supabase = /* createServerClient 생성 */
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 프로필 상태 확인
  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('status, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'pending') {
    return NextResponse.redirect(new URL('/pending', request.url))
  }

  // inactive 사용자 로그인 차단 (기존 데이터는 유지)
  if (profile.status === 'inactive') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin 전용 경로 보호
  if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
    if (profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/calendar', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
```

---

## 완료 체크리스트

- [ ] `lib/supabase/client.ts`, `server.ts` 작성
- [ ] 쿼리 함수 6개 작성 (events, notices, todos, profiles, teams, categories)
- [ ] Route Handlers 작성 (events, notices, todos, admin/*, share/kakao)
- [ ] 핀 제한 검증 로직 포함
- [ ] is_pinned role 검증 포함
- [ ] sort_order 일괄 업데이트 엔드포인트 포함
- [ ] `middleware.ts` 작성 (인증·pending·inactive·admin 보호)
- [ ] TypeScript 오류 없음 확인
