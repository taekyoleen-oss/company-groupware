import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { Sidebar } from '@/components/layout/Sidebar'
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { ApproverSidebar } from '@/components/layout/ApproverSidebar'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { MessageNotification } from '@/components/messages/MessageNotification'
import { IdleRefresh } from '@/components/layout/IdleRefresh'
import type { ProfileWithTeam } from '@/types/app'
import { isSuperAdmin } from '@/lib/auth/roles'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('cg_profiles')
    .select('*, team:cg_teams(id,name)')
    .eq('id', user.id)
    .single()

  if (!profile || (profile as any).status !== 'active') redirect('/pending')

  const p = profile as ProfileWithTeam
  const superAdmin = isSuperAdmin(p)

  // 매니저라도 본인이 결재자(approver_id=me)로 지정된 직원이 0명이면 결재함을 노출하지 않는다.
  let isApprover = false
  if (!superAdmin && p.role === 'manager') {
    const { count } = await supabase
      .from('cg_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('approver_id', user.id)
    isApprover = (count ?? 0) > 0
  }

  return (
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
  )
}
