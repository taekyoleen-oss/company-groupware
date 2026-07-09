'use client'
import { useEffect, useRef } from 'react'
import { mutate } from 'swr'

// 유휴 상태에서 데이터를 최신화하되, 과거처럼 전체 페이지를 리로드하지 않는다.
//   - window.location.reload() 는 번들 재다운로드 + 미들웨어(auth/profile) 재조회 +
//     Realtime 재연결을 매번 유발해 Disk IO 를 크게 소모했다(특히 밤새 켜둔 탭).
//   - 대신 SWR 캐시만 재검증(mutate(() => true))하여 실제로 화면에 쓰이는 데이터만 갱신한다.
//   - 백그라운드 탭(document.hidden)에서는 타이머를 걸지 않고, 다시 보일 때 한 번만 갱신한다.
const IDLE_MS = 30 * 60 * 1000 // 30분

export function IdleRefresh() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clear = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
    }

    // 전역 SWR 캐시의 모든 key 재검증 (마운트된 hook 의 endpoint 만 실제 네트워크 호출됨)
    const revalidateAll = () => { mutate(() => true) }

    const schedule = () => {
      clear()
      // 화면에 보이지 않는 탭은 갱신할 이유가 없다 → 야간 방치 탭의 반복 IO 차단
      if (document.visibilityState !== 'visible') return
      timer.current = setTimeout(revalidateAll, IDLE_MS)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        revalidateAll()
        schedule()
      } else {
        clear()
      }
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, schedule, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    schedule()

    return () => {
      clear()
      events.forEach(e => window.removeEventListener(e, schedule))
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
