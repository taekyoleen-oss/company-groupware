import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { CG_PROFILE_HEADER, encodeProfileHeader } from '@/lib/auth/middleware-headers'

const PUBLIC_PATHS = ['/login', '/signup', '/pending']
const ADMIN_PATHS = ['/admin']

// 프로필 정보를 layout 으로 넘겨 layout 에서 cg_profiles 를 다시 조회하지 않도록
// 한 번에 직렬화해서 전달한다. (성능 — Phase 2)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 공개 경로는 인증/프로필 조회 없이 통과
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next({ request })
  }

  // 인증 + 프로필 조회용 임시 응답
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // layout 에서 필요한 모든 프로필 필드를 한 번에 조회
  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('id, full_name, color, team_id, role, is_super_admin, status')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).status === 'pending') {
    return NextResponse.redirect(new URL('/pending', request.url))
  }

  if ((profile as any).status === 'inactive') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 앱관리자 판정
  const isSuperAdmin = (profile as any).is_super_admin === true
    || ((profile as any).is_super_admin == null && (profile as any).role === 'admin')

  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && !isSuperAdmin) {
    return NextResponse.redirect(new URL('/calendar', request.url))
  }
  if (pathname.startsWith('/approvals') && !(isSuperAdmin || (profile as any).role === 'manager')) {
    return NextResponse.redirect(new URL('/calendar', request.url))
  }

  // 매니저(관리 직원 보유) 여부 계산 → layout 으로 전달.
  // 앱관리자/매니저가 아니면 굳이 카운트 안 함.
  let approverScopeCount = 0
  if (!isSuperAdmin && (profile as any).role === 'manager') {
    const { count } = await supabase
      .from('cg_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('approver_id', user.id)
    approverScopeCount = count ?? 0
  }

  // layout 으로 프로필 + 스코프 정보 전달.
  // HTTP 헤더는 ByteString 만 허용하므로 한글이 들어가는 full_name 까지 안전하게 보내려면 base64.
  const payload = encodeProfileHeader({
    id: (profile as any).id,
    full_name: (profile as any).full_name,
    color: (profile as any).color,
    team_id: (profile as any).team_id,
    role: (profile as any).role,
    is_super_admin: (profile as any).is_super_admin,
    status: (profile as any).status,
    approver_scope_count: approverScopeCount,
  })

  // request 와 response 양쪽에 헤더 추가 — layout 은 next/headers 로 읽음.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CG_PROFILE_HEADER, payload)

  // setAll 이 위에서 response 를 새로 만들었을 수도 있으니, 새 응답에 헤더 병합
  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } })
  // 기존 response 의 set-cookie 등을 복사
  response.cookies.getAll().forEach(c => finalResponse.cookies.set(c.name, c.value, c))
  finalResponse.headers.set(CG_PROFILE_HEADER, payload)
  return finalResponse
}

export const config = {
  matcher: [
    /*
      페이지 네비게이션만 검사합니다.
      - /api/* : 여기서 로그인으로 리다이렉트하면 응답이 HTML이 되어 fetch/RSC 파싱 오류(TypeError … is not a function) 유발
      - /_next/* : 번들·Flight 등 내부 요청은 통과 (일부만 제외하면 나머지 요청이 미들웨어에 걸림)
    */
    '/((?!api/|_next/|favicon.ico).*)',
  ],
}
