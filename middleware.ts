import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/pending']
const ADMIN_PATHS = ['/admin']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next({ request })

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return response

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

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('status, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status === 'pending') {
    return NextResponse.redirect(new URL('/pending', request.url))
  }

  if (profile.status === 'inactive') {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (ADMIN_PATHS.some(p => pathname.startsWith(p)) && profile.role !== 'admin') {
    return NextResponse.redirect(new URL('/calendar', request.url))
  }

  return response
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
