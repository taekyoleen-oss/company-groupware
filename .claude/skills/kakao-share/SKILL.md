# 스킬: kakao-share

## 트리거 조건

공유 버튼, 카카오톡 공유 포맷 텍스트 생성, KakaoShareModal 구현 시 이 스킬을 참조한다.

---

## v1.0 구현 방식

Kakao SDK 미연동. 공유 포맷 텍스트를 생성하여 클립보드에 복사하는 방식.
**공지 상세 + 일정 상세 양쪽**에 공유 버튼 제공.

---

## 포맷 텍스트 포맷터 (`lib/utils/kakaoFormat.ts`)

```typescript
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// HTML 태그 제거 (Tiptap 콘텐츠에서 순수 텍스트 추출)
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// 날짜 범위 포맷
function formatDateRange(startAt: string, endAt: string, isAllDay: boolean): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (isAllDay) {
    return format(start, 'yyyy.MM.dd (EEE)', { locale: ko })
  }
  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
  if (sameDay) {
    return `${format(start, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })} ~ ${format(end, 'HH:mm')}`
  }
  return `${format(start, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })} ~ ${format(end, 'yyyy.MM.dd (EEE) HH:mm', { locale: ko })}`
}

// 이벤트 공유 포맷
export function formatEventShare(event: {
  id: string
  title: string
  start_at: string
  end_at: string
  is_all_day: boolean
  location?: string | null
  category?: { name: string } | null
  author: { full_name: string }
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const categoryLabel = event.category?.name ?? '일정'
  const lines = [
    `📅 [${categoryLabel}] ${event.title}`,
    `⏰ ${formatDateRange(event.start_at, event.end_at, event.is_all_day)}`,
    event.location ? `📍 ${event.location}` : null,
    `👤 ${event.author.full_name}`,
    `🔗 ${appUrl}/calendar/${event.id}`,
  ].filter(Boolean)
  return lines.join('\n')
}

// 공지 공유 포맷
export function formatNoticeShare(notice: {
  id: string
  title: string
  content: string  // Tiptap HTML
  author: { full_name: string }
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const summary = stripHtml(notice.content).slice(0, 100)
  const lines = [
    `📢 ${notice.title}`,
    `✏️ ${summary}${summary.length >= 100 ? '...' : ''}`,
    `👤 ${notice.author.full_name}`,
    `🔗 ${appUrl}/notices/${notice.id}`,
  ]
  return lines.join('\n')
}
```

---

## KakaoShareModal 컴포넌트

```tsx
// components/share/KakaoShareModal.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatEventShare, formatNoticeShare } from '@/lib/utils/kakaoFormat'

interface KakaoShareModalProps {
  type: 'event' | 'notice'
  data: EventShareData | NoticeShareData
  isOpen: boolean
  onClose: () => void
}

export function KakaoShareModal({ type, data, isOpen, onClose }: KakaoShareModalProps) {
  const [copied, setCopied] = useState(false)

  const shareText = type === 'event'
    ? formatEventShare(data as EventShareData)
    : formatNoticeShare(data as NoticeShareData)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>카카오톡 공유</DialogTitle>
        </DialogHeader>
        <div className="bg-[#F9FAFB] rounded-lg p-4 whitespace-pre-line text-sm font-mono border">
          {shareText}
        </div>
        <p className="text-xs text-muted-foreground">
          위 텍스트를 복사하여 카카오톡에 붙여넣기 하세요.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button onClick={handleCopy}>
            {copied ? '✓ 복사됨' : '클립보드 복사'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 공유 버튼 배치

일정 상세 (`/calendar/[id]`) 및 공지 상세 (`/notices/[id]`) 페이지에 동일하게 배치:

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setShareModalOpen(true)}
>
  카카오톡 공유
</Button>

<KakaoShareModal
  type="event" // 또는 "notice"
  data={eventOrNoticeData}
  isOpen={shareModalOpen}
  onClose={() => setShareModalOpen(false)}
/>
```

---

## v2.0 연동 계획

v2.0에서는 아래 방식으로 실제 Kakao SDK 연동:

```typescript
// 환경변수: KAKAO_JAVASCRIPT_KEY
Kakao.Share.sendDefault({
  objectType: 'text',
  text: shareText,
  link: {
    mobileWebUrl: shareUrl,
    webUrl: shareUrl,
  },
})
```

상세 SDK 문서: `.claude/skills/kakao-share/references/kakao-sdk-guide.md`
