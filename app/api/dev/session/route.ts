import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // 1. 프로덕션 즉시 차단
    if (process.env.NODE_ENV !== 'development')
      return Response.json({ error: 'Not available' }, { status: 404 })

    // 2. localhost 외 차단
    const host = request.headers.get('host') ?? ''
    if (!host.includes('localhost') && !host.includes('127.0.0.1'))
      return Response.json({ error: 'Forbidden' }, { status: 403 })

    // 3. secret 토큰 검증
    const { secret, userId } = await request.json()
    if (!secret || secret !== process.env.SCREENSHOT_SECRET)
      return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // userId → email 조회
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
    if (userError) return Response.json({ error: userError.message }, { status: 500 })

    // 일회용 magic link 생성 (쿠키 없이 브라우저가 직접 방문해 세션 수립)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email!,
      options: { redirectTo: `${appUrl}/calendar` },
    })
    if (linkError) return Response.json({ error: linkError.message }, { status: 500 })

    return Response.json({ action_link: linkData.properties.action_link })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
