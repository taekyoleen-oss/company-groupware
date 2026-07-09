import type { NextRequest } from 'next/server'

// 클라이언트 IP 추출 — 신뢰할 수 있는 프록시가 세팅한 값만 사용한다.
//
// 보안 주의: cf-connecting-ip 나 x-forwarded-for 의 "가장 왼쪽" 값은 클라이언트가
// 임의로 붙일 수 있어 위조 가능하다(재택에서 사무실 IP 를 흉내내 출근 체크 우회).
// 이 앱은 Vercel 배포이며 Cloudflare 가 앞단에 없으므로:
//   1) Vercel 이 실제 접속 IP 로 세팅하는 x-real-ip 를 최우선 신뢰한다(클라이언트가 덮어쓸 수 없음).
//   2) 폴백으로 x-forwarded-for 의 "가장 오른쪽"(신뢰 프록시가 덧붙인 실제 IP) 값을 사용한다.
// Cloudflare 등 다른 프록시를 실제로 앞단에 두는 배포로 바뀌면 이 우선순위를 재검토할 것.
export function getClientIp(request: NextRequest): string | null {
  const headers = request.headers

  const real = headers.get('x-real-ip')
  if (real) return normalizeIp(real.trim())

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) return normalizeIp(last)
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
