'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Pin, Search, Paperclip, Users, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserAvatar } from '@/components/ui/avatar'
import { formatRelative } from '@/lib/utils/dateFormat'
import type { NoticeWithDetails } from '@/types/app'

// HTML → 본문 미리보기 텍스트 (태그·엔티티 제거 + 공백 정리)
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// 제목 prefix(예: [공통], [관리자]) 추출 → 카드 상단 배지
function extractPrefix(title: string): { tag: string | null; rest: string } {
  const m = title.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (!m) return { tag: null, rest: title }
  return { tag: m[1], rest: m[2] }
}

// prefix 별 강조 색상
function prefixTone(tag: string | null): { bar: string; chip: string; chipText: string } {
  switch (tag) {
    case '공통':
      return {
        bar: 'bg-gradient-to-r from-[#8B5CF6] to-[#6366F1]',
        chip: 'bg-[#EDE9FE] dark:bg-[#3B0764]/40 text-[#6D28D9] dark:text-[#C4B5FD]',
        chipText: '공통',
      }
    case '실무자':
      return {
        bar: 'bg-gradient-to-r from-[#2563EB] to-[#06B6D4]',
        chip: 'bg-[#DBEAFE] dark:bg-[#1E3A5F]/60 text-[#1D4ED8] dark:text-[#93C5FD]',
        chipText: '실무자',
      }
    case '관리자':
      return {
        bar: 'bg-gradient-to-r from-[#F59E0B] to-[#EF4444]',
        chip: 'bg-[#FEF3C7] dark:bg-[#451A03]/60 text-[#B45309] dark:text-[#FCD34D]',
        chipText: '관리자',
      }
    case '휴가':
      return {
        bar: 'bg-gradient-to-r from-[#F59E0B] to-[#FB923C]',
        chip: 'bg-[#FEF3C7] dark:bg-[#451A03]/60 text-[#92400E] dark:text-[#FCD34D]',
        chipText: '휴가',
      }
    case '출근':
      return {
        bar: 'bg-gradient-to-r from-[#10B981] to-[#22C55E]',
        chip: 'bg-[#D1FAE5] dark:bg-[#064E3B]/60 text-[#047857] dark:text-[#6EE7B7]',
        chipText: '출근',
      }
    case '일정':
      return {
        bar: 'bg-gradient-to-r from-[#3B82F6] to-[#0EA5E9]',
        chip: 'bg-[#DBEAFE] dark:bg-[#1E3A5F]/60 text-[#1D4ED8] dark:text-[#93C5FD]',
        chipText: '일정',
      }
    default:
      return {
        bar: 'bg-gradient-to-r from-[#64748B] to-[#475569]',
        chip: 'bg-[#F1F5F9] dark:bg-[#334155] text-[#475569] dark:text-[#CBD5E1]',
        chipText: tag ?? '공지',
      }
  }
}

export default function NoticesPage() {
  const [tab, setTab] = useState<'company' | 'team'>('company')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [notices, setNotices] = useState<NoticeWithDetails[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 입력마다 즉시 검색하지 않고 300ms debounce → 타이핑 중 과도한 요청 방지
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchNotices = useCallback(async (reset = false) => {
    setLoading(true)
    // 이전 요청 취소 → 빠른 타이핑 시 늦게 도착한 응답이 최신 결과를 덮어쓰는 레이스 방지
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const c = reset ? undefined : cursor
    const params = new URLSearchParams({ tab, search: debouncedSearch })
    if (c) params.set('cursor', c)
    try {
      const res = await fetch(`/api/notices?${params}`, { signal: controller.signal })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setNotices(prev => reset ? data.items : [...prev, ...data.items])
      setHasMore(data.hasMore)
      if (data.items.length > 0) setCursor(data.items[data.items.length - 1].created_at)
      setLoading(false)
    } catch (e) {
      // 취소된 요청은 무시, 그 외 오류만 로딩 해제
      if ((e as any)?.name !== 'AbortError') setLoading(false)
    }
  }, [tab, debouncedSearch, cursor])

  useEffect(() => {
    setNotices([])
    setCursor(undefined)
    fetchNotices(true)
  }, [tab, debouncedSearch])

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) fetchNotices()
    }, { threshold: 0.1 })
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, fetchNotices])

  // 핀 고정 ↑, 그 외 최신순 — API 가 이미 그렇게 주지만 클라이언트에서 한 번 더 보장
  const sorted = useMemo(() => {
    return [...notices].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [notices])

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#111827] dark:text-[#F1F5F9] flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-[#2563EB]" />
          공지사항
        </h1>
        <Link href="/notices/new">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" />글쓰기</Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="company">전체 공지</TabsTrigger>
          <TabsTrigger value="team">팀 공지</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] dark:text-[#94A3B8]" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="제목으로 검색..."
          className="pl-9"
        />
      </div>

      {/* 카드 그리드 — 모바일 1열, md 이상 2열 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.length === 0 && !loading && (
          <div className="col-span-full text-center py-16 text-[#6B7280] dark:text-[#94A3B8] text-sm">
            공지사항이 없습니다.
          </div>
        )}

        {sorted.map(notice => {
          const { tag, rest } = extractPrefix(notice.title)
          const tone = prefixTone(tag)
          const preview = stripHtml(notice.content ?? '')
          const author = notice.author as any
          return (
            <Link key={notice.id} href={`/notices/${notice.id}`} className="group">
              <article
                className={`relative bg-white dark:bg-[#1E293B] rounded-2xl border ${
                  notice.is_pinned
                    ? 'border-[#FCD34D] dark:border-[#B45309] shadow-[0_0_0_1px_rgba(253,224,71,0.4)]'
                    : 'border-[#E5E7EB] dark:border-[#334155]'
                } overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg h-full flex flex-col`}
              >
                {/* 상단 컬러 바 */}
                <div className={`h-1.5 w-full ${tone.bar}`} />

                <div className="p-5 flex-1 flex flex-col">
                  {/* 상단 메타 */}
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {notice.is_pinned && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FEF3C7] text-[#92400E] dark:bg-[#451A03]/60 dark:text-[#FCD34D]">
                        <Pin className="h-3 w-3" />고정
                      </span>
                    )}
                    {tag && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone.chip}`}>
                        {tone.chipText}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F3F4F6] dark:bg-[#334155] text-[#6B7280] dark:text-[#94A3B8]">
                      <Users className="h-3 w-3" />
                      {notice.visibility === 'company' ? '전사' : '팀'}
                    </span>
                    {notice.attachments?.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#F3F4F6] dark:bg-[#334155] text-[#6B7280] dark:text-[#94A3B8]">
                        <Paperclip className="h-3 w-3" />{notice.attachments.length}
                      </span>
                    )}
                  </div>

                  {/* 제목 — 최대 2줄 */}
                  <h3 className="text-base font-bold text-[#111827] dark:text-[#F1F5F9] leading-snug mb-2 line-clamp-2 break-keep">
                    {rest}
                  </h3>

                  {/* 본문 미리보기 — 최대 3줄 */}
                  {preview && (
                    <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] leading-relaxed line-clamp-3 mb-4 break-keep">
                      {preview}
                    </p>
                  )}

                  {/* 푸터 — 작성자 + 시간 */}
                  <div className="mt-auto pt-3 border-t border-[#F3F4F6] dark:border-[#334155] flex items-center gap-2">
                    <UserAvatar name={author?.full_name ?? ''} color={author?.color ?? '#6B7280'} size={20} />
                    <span className="text-xs font-medium text-[#374151] dark:text-[#D1D5DB] truncate">
                      {author?.full_name ?? '—'}
                    </span>
                    <span className="text-xs text-[#9CA3AF] dark:text-[#64748B] ml-auto shrink-0">
                      {formatRelative(notice.created_at)}
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          )
        })}

        {loading && (
          <div className="col-span-full text-center py-6 text-sm text-[#6B7280] dark:text-[#94A3B8]">
            불러오는 중...
          </div>
        )}
        <div ref={loaderRef} className="col-span-full h-4" />
      </div>
    </div>
  )
}
