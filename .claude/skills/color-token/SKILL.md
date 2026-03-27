# 스킬: color-token

## 트리거 조건

이벤트 표시 색상을 결정할 때 이 스킬을 참조한다.

---

## 색상 우선순위 규칙

```
1순위: cg_events.color (사용자가 개별 일정에 직접 지정)
2순위: cg_event_categories.color (카테고리별 색상)
3순위: cg_profiles.color (작성자 기본 색상)
4순위: 시스템 기본 색상 (#3B82F6)
```

---

## 유틸 함수 (`lib/utils/eventColor.ts`)

```typescript
interface EventColorInput {
  color?: string | null           // cg_events.color
  category?: { color: string } | null  // cg_event_categories
  author?: { color: string } | null    // cg_profiles
}

const DEFAULT_COLOR = '#3B82F6'

export function resolveEventColor(event: EventColorInput): string {
  return (
    event.color ??
    event.category?.color ??
    event.author?.color ??
    DEFAULT_COLOR
  )
}
```

---

## 사용자 색상 팔레트 (고정 12가지)

```typescript
// lib/utils/eventColor.ts
export const USER_COLOR_PALETTE = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#10B981', '#14B8A6', '#3B82F6', '#6366F1',
  '#8B5CF6', '#EC4899', '#F43F5E', '#64748B',
] as const

export type UserColor = typeof USER_COLOR_PALETTE[number]

/**
 * 가입 시 자동 색상 배정 — active 사용자 수 기반 순환 배정
 * (서버 사이드에서 호출)
 */
export function assignUserColor(existingUserCount: number): UserColor {
  return USER_COLOR_PALETTE[existingUserCount % USER_COLOR_PALETTE.length]
}
```

---

## 카테고리 기본 색상

```typescript
export const CATEGORY_DEFAULT_COLORS: Record<string, string> = {
  '회의': '#3B82F6',
  '출장': '#8B5CF6',
  '휴가': '#10B981',
  '교육': '#F59E0B',
  '행사': '#EF4444',
  '기타': '#6B7280',
}
```

---

## Badge 동적 색상 적용

```tsx
// components/calendar/EventColorBadge.tsx
interface EventColorBadgeProps {
  event: EventColorInput
  label: string
}

export function EventColorBadge({ event, label }: EventColorBadgeProps) {
  const color = resolveEventColor(event)
  return (
    <span
      style={{ backgroundColor: color + '20', color, border: `1px solid ${color}40` }}
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
    >
      {label}
    </span>
  )
}
```

---

## 프로필 색상 변경 흐름

```
사용자 프로필 페이지 → 색상 팔레트 12개 표시 → 선택 클릭
→ PATCH /api/profiles { color: '#...' }
→ cg_profiles.color 업데이트
→ 이후 작성 이벤트 색상에 반영 (3순위)
```
