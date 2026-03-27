'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Plus, Pin, Search, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/avatar'
import { formatRelative } from '@/lib/utils/dateFormat'
import type { NoticeWithDetails } from '@/types/app'

export default function NoticesPage() {
  const [tab, setTab] = useState<'company' | 'team'>('company')
  const [search, setSearch] = useState('')
  const [notices, setNotices] = useState<NoticeWithDetails[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

  const fetchNotices = useCallback(async (reset = false) => {
    setLoading(true)
    const c = reset ? undefined : cursor
    const params = new URLSearchParams({ tab, search })
    if (c) params.set('cursor', c)
    const res = await fetch(`/api/notices?${params}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setNotices(prev => reset ? data.items : [...prev, ...data.items])
    setHasMore(data.hasMore)
    if (data.items.length > 0) setCursor(data.items[data.items.length - 1].created_at)
    setLoading(false)
  }, [tab, search, cursor])

  useEffect(() => {
    setNotices([])
    setCursor(undefined)
    fetchNotices(true)
  }, [tab, search])

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) fetchNotices()
    }, { threshold: 0.1 })
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [hasMore, loading, fetchNotices])

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-[#111827]">공지사항</h1>
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

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="제목으로 검색..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {notices.length === 0 && !loading && (
          <div className="text-center py-12 text-[#6B7280] text-sm">공지사항이 없습니다.</div>
        )}
        {notices.map(notice => (
          <Link key={notice.id} href={`/notices/${notice.id}`}>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {notice.is_pinned && <Pin className="h-4 w-4 text-[#F59E0B] shrink-0" />}
                  <h3 className="font-medium text-[#111827] truncate">{notice.title}</h3>
                  {notice.attachments?.length > 0 && <Paperclip className="h-3.5 w-3.5 text-[#6B7280] shrink-0" />}
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {notice.visibility === 'company' ? '전사' : '팀'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <UserAvatar name={(notice.author as any)?.full_name ?? ''} color={(notice.author as any)?.color ?? '#6B7280'} size={16} />
                <span className="text-xs text-[#6B7280]">{(notice.author as any)?.full_name}</span>
                <span className="text-xs text-[#6B7280]">·</span>
                <span className="text-xs text-[#6B7280]">{formatRelative(notice.created_at)}</span>
              </div>
            </div>
          </Link>
        ))}
        {loading && <div className="text-center py-4 text-sm text-[#6B7280]">불러오는 중...</div>}
        <div ref={loaderRef} className="h-4" />
      </div>
    </div>
  )
}
