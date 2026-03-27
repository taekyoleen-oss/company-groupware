import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '사내 그룹웨어',
  description: '일정 관리, 공지 게시판, TO-DO 통합 그룹웨어',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
