import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { Sidebar } from '@/components/layout/Sidebar'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { ApproverSidebar } from '@/components/layout/ApproverSidebar'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { MessageNotification } from '@/components/messages/MessageNotification'
import { IdleRefresh } from '@/components/layout/IdleRefresh'
import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
import type { ProfileWithTeam } from '@/types/app'
import { isSuperAdmin } from '@/lib/auth/roles'
import { CG_PROFILE_HEADER, type MiddlewareProfilePayload } from '@/lib/auth/middleware-headers'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 1) middleware 가 직렬화한 프로필을 헤더에서 읽음 (cg_profiles SELECT 생략 — Phase 2)
  const h = await headers()
  const raw = h.get(CG_PROFILE_HEADER)

  let payload: MiddlewareProfilePayload | null = null
  if (raw) {
    try { payload = JSON.parse(raw) as MiddlewareProfilePayload } catch { payload = null }
  }

  // 2) 헤더가 없거나 손상된 경우 (RSC prefetch, 미들웨어 미적용 등) — 안전망으로 직접 조회
  if (!payload) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { data: profile } = await supabase
      .from('cg_profiles')
      .select('id, full_name, color, team_id, role, is_super_admin, status')
      .eq('id', user.id)
      .single()
    if (!profile || (profile as any).status !== 'active') redirect('/pending')

    let scope = 0
    const sup = (profile as any).is_super_admin === true
      || ((profile as any).is_super_admin == null && (profile as any).role === 'admin')
    if (!sup && (profile as any).role === 'manager') {
      const { count } = await supabase
        .from('cg_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('approver_id', user.id)
      scope = count ?? 0
    }
    payload = { ...(profile as any), approver_scope_count: scope }
  }

  // ProfileWithTeam 타입 호환을 위해 team 은 null 로 둠 (실제로 layout/하위 컴포넌트에서 사용 안 함)
  const p: ProfileWithTeam = { ...(payload as any), team: null } as ProfileWithTeam
  const superAdmin = isSuperAdmin(p)
  const isApprover = !superAdmin && p.role === 'manager' && (payload!.approver_scope_count > 0)

  return (
    <RealtimeProvider userId={p.id} teamId={p.team_id ?? null}>
      <div className="flex flex-col min-h-screen">
        <AppHeader profile={p} isApprover={isApprover} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            {children}
          </main>
          {superAdmin && <AdminSidebar />}
          {isApprover && <ApproverSidebar />}
        </div>
        <BottomTabBar role={p.role} isSuperAdmin={superAdmin} isApprover={isApprover} />
        <MessageNotification userId={p.id} teamId={p.team_id ?? null} />
        <IdleRefresh />
      </div>
    </RealtimeProvider>
  )
}
