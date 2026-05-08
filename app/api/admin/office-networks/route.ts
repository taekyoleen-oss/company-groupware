import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function isValidCidr(cidr: string): boolean {
  const parts = cidr.includes('/') ? cidr.split('/') : [cidr, '32']
  if (parts.length !== 2) return false
  const [ip, prefix] = parts
  const ipParts = ip.split('.')
  if (ipParts.length !== 4) return false
  for (const p of ipParts) {
    const n = parseInt(p, 10)
    if (isNaN(n) || n < 0 || n > 255 || String(n) !== p) return false
  }
  const prefixNum = parseInt(prefix, 10)
  return !isNaN(prefixNum) && prefixNum >= 0 && prefixNum <= 32
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { data, error } = await supabase
    .from('cg_office_networks')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { cidr, label } = await request.json()
  if (!cidr || !isValidCidr(cidr.trim())) {
    return NextResponse.json({ error: '올바른 IPv4 주소 또는 CIDR 형식이 아닙니다. 예: 203.0.113.10 또는 203.0.113.0/24' }, { status: 400 })
  }

  // /32 없으면 자동으로 /32 추가
  const normalized = cidr.trim().includes('/') ? cidr.trim() : `${cidr.trim()}/32`

  const { data, error } = await supabase
    .from('cg_office_networks')
    .insert({ cidr: normalized, label: label?.trim() || null, created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
