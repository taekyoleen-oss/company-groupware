export const USER_COLOR_PALETTE = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#10B981', '#14B8A6', '#3B82F6', '#6366F1',
  '#8B5CF6', '#EC4899', '#F43F5E', '#64748B',
] as const

export const DEFAULT_COLOR = '#3B82F6'

export interface EventColorInput {
  color?: string | null
  category?: { color: string } | null
  author?: { color: string } | null
}

export function resolveEventColor(event: EventColorInput): string {
  return event.color ?? event.category?.color ?? event.author?.color ?? DEFAULT_COLOR
}

export function assignUserColor(existingUserCount: number): string {
  return USER_COLOR_PALETTE[existingUserCount % USER_COLOR_PALETTE.length]
}

export const CATEGORY_COLORS: Record<string, string> = {
  '회의': '#3B82F6', '출장': '#8B5CF6', '휴가': '#10B981',
  '교육': '#F59E0B', '행사': '#EF4444', '기타': '#6B7280',
}
