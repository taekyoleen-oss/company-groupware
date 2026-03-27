'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export default function PendingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setEmail(data.user.email ?? '')
    })
  }, [])

  const checkStatus = async () => {
    setChecking(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('cg_profiles')
      .select('status, role')
      .eq('id', user.id)
      .single()

    if (profile?.status === 'active') {
      router.push('/calendar')
      router.refresh()
    } else {
      alert('아직 승인되지 않았습니다. 관리자에게 문의하세요.')
      setChecking(false)
    }
  }

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-[#EFF6FF] flex items-center justify-center mx-auto mb-4">
          <Clock className="h-8 w-8 text-[#2563EB]" />
        </div>
        <h1 className="text-xl font-bold text-[#111827] mb-2">승인 대기 중</h1>
        <p className="text-[#6B7280] text-sm mb-6">
          가입 신청이 완료되었습니다.<br />
          관리자 승인 후 서비스를 이용하실 수 있습니다.<br />
          승인 완료 시 관리자가 직접 안내해 드립니다.
        </p>
        {email && <p className="text-xs text-[#6B7280] mb-6">가입 이메일: {email}</p>}
        <div className="space-y-2">
          <Button className="w-full" onClick={checkStatus} disabled={checking}>
            {checking ? '확인 중...' : '승인 여부 확인'}
          </Button>
          <Button variant="outline" className="w-full" onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  )
}
