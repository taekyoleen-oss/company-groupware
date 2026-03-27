'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setLoading(false)
      return
    }
    router.push('/calendar')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#2563EB]">그룹웨어</h1>
          <p className="text-[#6B7280] mt-1 text-sm">업무를 더 스마트하게</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">로그인</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">이메일</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#111827] mb-1">비밀번호</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <p className="text-sm text-[#EF4444]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>
          <p className="text-sm text-center mt-4 text-[#6B7280]">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-[#2563EB] hover:underline">회원가입</Link>
          </p>
          <p className="text-xs text-center mt-2 text-[#6B7280]">
            비밀번호를 잊으셨나요? 관리자에게 문의하세요.
          </p>
        </div>
      </div>
    </div>
  )
}
