import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/layout/AppHeader'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomTabBar } from '@/components/layout/BottomTabBar'
import { MessageNotification } from '@/components/messages/MessageNotification'
import type { ProfileWithTeam } from '@/types/app'

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

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader profile={profile as ProfileWithTeam} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <BottomTabBar />
      <MessageNotification userId={profile.id} teamId={profile.team_id ?? null} />
    </div>
  )
}
