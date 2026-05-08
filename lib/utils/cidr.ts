import type { NextRequest } from 'next/server'

// 신뢰할 수 있는 프록시 헤더 우선순위로 클라이언트 IP 추출
export function getClientIp(request: NextRequest): string | null {
  const headers = request.headers
  const cf = headers.get('cf-connecting-ip')
  if (cf) return normalizeIp(cf.trim())

  const real = headers.get('x-real-ip')
  if (real) return normalizeIp(real.trim())

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return normalizeIp(first)
  }

  return null
}

// IPv6-mapped IPv4 (::ffff:1.2.3.4) → IPv4 정규화
function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

// IPv4 CIDR 매칭 (예: '203.0.113.10/32', '203.0.113.0/24')
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  try {
    const [networkStr, prefixStr] = cidr.includes('/') ? cidr.split('/') : [cidr, '32']
    const prefix = parseInt(prefixStr, 10)
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false

    const ipNum = ipToNumber(ip)
    const netNum = ipToNumber(networkStr)
    if (ipNum === null || netNum === null) return false

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
    return (ipNum & mask) === (netNum & mask)
  } catch {
    return false
  }
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let num = 0
  for (const part of parts) {
    const n = parseInt(part, 10)
    if (isNaN(n) || n < 0 || n > 255) return null
    num = (num << 8) | n
  }
  return num >>> 0
}
