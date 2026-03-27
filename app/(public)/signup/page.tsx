'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', fullName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName } },
    })

    if (signUpError) {
      setError(signUpError.message ?? '회원가입에 실패했습니다.')
      setLoading(false)
      return
    }

    // 이메일 확인이 필요한 경우 (세션 없음)
    if (!data.session) {
      setError('')
      setLoading(false)
      alert('가입 신청이 완료되었습니다. 이메일 확인 후 로그인해 주세요.')
      router.push('/login')
      return
    }

    // 이메일 확인 불필요 설정인 경우 — 프로필 조회해서 역할 확인
    const { data: profile } = await supabase
      .from('cg_profiles')
      .select('role, status')
      .eq('id', data.user!.id)
      .single()

    if (profile?.role === 'admin') {
      router.push('/calendar')
    } else {
      router.push('/pending')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#2563EB]">그룹웨어</h1>
          <p className="text-[#6B7280] mt-1 text-sm">회원가입 후 관리자 승인을 기다려 주세요</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">회원가입</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">이름</label>
              <Input
                value={form.fullName}
                onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                placeholder="홍길동"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">이메일</label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="name@company.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">비밀번호</label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="6자 이상"
                minLength={6}
                required
              />
            </div>
            {error && <p className="text-sm text-[#EF4444]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '가입 중...' : '가입 신청'}
            </Button>
          </form>
          <p className="text-sm text-center mt-4 text-[#6B7280]">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-[#2563EB] hover:underline">로그인</Link>
          </p>
          <p className="text-xs text-center mt-2 text-[#94A3B8]">
            ※ 처음 가입하는 계정은 자동으로 관리자가 됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}
