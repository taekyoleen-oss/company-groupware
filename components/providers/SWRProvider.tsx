'use client'
import { SWRConfig } from 'swr'

// 전역 SWR 설정 — 모든 클라이언트 컴포넌트의 useSWR 이 이 설정을 사용.
//
// 핵심 정책 :
//  - 같은 key 는 30초 안에 한 번만 네트워크 요청 (dedupe) — 중복 페칭 폭주 차단
//  - 탭 포커스 시 자동 갱신 비활성 (Realtime 으로 처리)
//  - 네트워크 재연결 시에만 자동 revalidate
//  - 일시적 에러는 2회 retry
//
// 동작·UI 는 그대로. 같은 endpoint 를 여러 컴포넌트가 부르더라도 한 번만 호출됨.

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const error: Error & { status?: number; info?: unknown } = new Error(`Request failed: ${res.status}`)
    error.status = res.status
    try { error.info = await res.json() } catch { /* noop */ }
    throw error
  }
  return res.json()
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 30_000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        errorRetryCount: 2,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  )
}
