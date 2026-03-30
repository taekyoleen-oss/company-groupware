'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Pin, Calendar, Send, Users, MessageSquare } from 'lucide-react'
import { formatDateRange } from '@/lib/utils/dateFormat'
import { resolveEventColor } from '@/lib/utils/eventColor'
import { MessageModal } from '@/components/messages/MessageModal'
import { RecipientSelect, type RecipientOption } from '@/components/messages/RecipientSelect'
import type { EventWithDetails, Notice } from '@/types/app'

interface TeamMember { id: string; full_name: string; color: string; role: string }
interface TeamInfo   { id: string; name: string }

function InitialAvatar({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
      style={{ backgroundColor: color ?? '#6B7280' }}
    >
      {name?.charAt(0) ?? '?'}
    </span>
  )
}

export function Sidebar() {
  const router   = useRouter()
  const pathname = usePathname()

  const [now,            setNow]            = useState(new Date())
  const [upcomingEvents, setUpcomingEvents] = useState<EventWithDetails[]>([])
  const [recentNotices,  setRecentNotices]  = useState<Notice[]>([])
  const [team,    setTeam]    = useState<TeamInfo | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])

  // 전사 일정 포함 체크박스 (기본: 포함)
  const [includeCompany, setIncludeCompany] = useState(true)

  // 사내 메시지 수신자 선택
  const [companyRecipient, setCompanyRecipient] = useState<RecipientOption | null>(null)

  // 메시지 모달
  const [msgModal, setMsgModal] = useState<{
    open: boolean
    recipientId?: string; recipientName?: string
    teamId?: string;      teamName?: string
  }>({ open: false })

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Data fetch
  useEffect(() => {
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    fetch(`/api/events?start=${now.toISOString()}&end=${in24h.toISOString()}`)
      .then(r => r.json())
      .then((data: EventWithDetails[]) => {
        setUpcomingEvents(data.slice(0, 5))
      }).catch(() => {})

    fetch('/api/notices')
      .then(r => r.json())
      .then((data: any) => setRecentNotices((data.items ?? []).slice(0, 5)))
      .catch(() => {})

    fetch('/api/teams/members')
      .then(r => r.json())
      .then((data: any) => { setTeam(data.team ?? null); setMembers(data.members ?? []) })
      .catch(() => {})
  }, [])

  // 전사 일정 체크박스 변경 → 캘린더 URL 업데이트
  const handleIncludeChange = (checked: boolean) => {
    setIncludeCompany(checked)
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!checked) params.set('includeCompany', 'false')
    else          params.delete('includeCompany')
    const qs = params.toString()
    router.push(`/calendar${qs ? '?' + qs : ''}`)
  }

  // 팀/멤버 필터 네비게이션
  const navigateFilter = (extra: string) => {
    const params = new URLSearchParams(extra)
    if (!includeCompany) params.set('includeCompany', 'false')
    router.push(`/calendar?${params.toString()}`)
  }

  const onCalendar = pathname.startsWith('/calendar')

  // 사내 메시지 보내기
  const sendCompanyMessage = () => {
    if (!companyRecipient) return
    setMsgModal(
      companyRecipient.type === 'user'
        ? { open: true, recipientId: companyRecipient.id, recipientName: companyRecipient.name }
        : { open: true, teamId: companyRecipient.id, teamName: companyRecipient.name }
    )
    setCompanyRecipient(null)
  }

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white border-r border-[#E5E7EB] p-4 gap-5 overflow-y-auto dark:bg-[#1F2937] dark:border-[#374151]">

      {/* ── 날짜 / 시간 ── */}
      <div className="rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] px-4 py-3 text-center dark:bg-[#1E3A5F] dark:border-[#1E40AF]">
        <p className="text-[11px] font-medium text-[#2563EB] tracking-wide dark:text-[#93C5FD]">
          {format(now, 'yyyy년 M월 d일', { locale: ko })}
        </p>
        <p className="text-3xl font-bold text-[#1E3A8A] tracking-tight leading-tight mt-0.5 dark:text-[#BFDBFE]">
          {format(now, 'HH:mm')}
          <span className="text-xl font-semibold text-[#3B82F6] dark:text-[#60A5FA]">:{format(now, 'ss')}</span>
        </p>
        <p className="text-sm font-semibold text-[#2563EB] mt-0.5 dark:text-[#93C5FD]">
          {format(now, 'EEEE', { locale: ko })}
        </p>
      </div>

      {/* ── 최근 공지 ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider dark:text-[#9CA3AF]">최근 공지</h3>
          <Link href="/notices" className="text-[10px] text-[#2563EB] hover:underline dark:text-[#60A5FA]">더보기</Link>
        </div>
        {recentNotices.length === 0 ? (
          <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">공지사항이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentNotices.map(notice => (
              <li key={notice.id}>
                <Link href={`/notices/${notice.id}`}
                  className="flex items-start gap-1.5 hover:bg-[#F9FAFB] rounded-lg p-1.5 -mx-1.5 transition-colors group dark:hover:bg-[#374151]">
                  {notice.is_pinned && <Pin className="h-3 w-3 text-[#2563EB] mt-0.5 shrink-0 dark:text-[#60A5FA]" />}
                  <p className="text-xs text-[#111827] truncate group-hover:text-[#2563EB] transition-colors dark:text-[#F9FAFB] dark:group-hover:text-[#60A5FA]">{notice.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 다가오는 일정 ── */}
      <div>
        <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2 dark:text-[#9CA3AF]">24시간 이내 일정</h3>
        {upcomingEvents.length === 0 ? (
          <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">예정된 일정이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingEvents.map(event => (
              <li key={event.id}>
                <Link href={`/calendar/${event.id}`}
                  className="flex items-start gap-2 hover:bg-[#F9FAFB] rounded-lg p-1.5 -mx-1.5 transition-colors dark:hover:bg-[#374151]">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: resolveEventColor({ color: event.color, category: event.category as any, author: event.author as any }) }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#111827] truncate dark:text-[#F9FAFB]">{event.title}</p>
                    <p className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF]">{formatDateRange(event.start_at, event.end_at, event.is_all_day)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 우리 팀 + 사내 메시지 (하단 고정) ── */}
      <div className="mt-auto flex flex-col gap-0">

      {/* 우리 팀 */}
      {team && (
        <div className="border-t border-[#E5E7EB] pt-4 dark:border-[#374151]">
          {/* 헤더: 우리 팀 + 전사 일정 체크박스 */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider flex items-center gap-1 dark:text-[#9CA3AF]">
              <Users className="h-3 w-3" />
              우리 팀
            </h3>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCompany}
                onChange={e => handleIncludeChange(e.target.checked)}
                className="w-3 h-3 rounded accent-[#2563EB] cursor-pointer"
              />
              <span className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF]">전사 일정</span>
            </label>
          </div>

          {/* 팀 행 */}
          <div className="flex items-center gap-1 mb-2 -mx-1 px-1 rounded-lg hover:bg-[#F9FAFB] py-1 transition-colors dark:hover:bg-[#374151]">
            <span className="flex-1 text-xs font-semibold text-[#111827] truncate dark:text-[#F9FAFB]">{team.name}</span>
            <button title="팀 일정 보기"
              onClick={() => navigateFilter('filter=team')}
              className={`p-1 rounded hover:bg-[#DBEAFE] transition-colors dark:hover:bg-[#1E3A5F] ${onCalendar ? 'text-[#2563EB] dark:text-[#60A5FA]' : 'text-[#6B7280] hover:text-[#2563EB] dark:text-[#9CA3AF] dark:hover:text-[#60A5FA]'}`}>
              <Calendar className="h-3.5 w-3.5" />
            </button>
            <button title="팀 전체에게 메시지"
              onClick={() => setMsgModal({ open: true, teamId: team.id, teamName: team.name })}
              className="p-1 rounded text-[#6B7280] hover:text-[#2563EB] hover:bg-[#DBEAFE] transition-colors dark:text-[#9CA3AF] dark:hover:text-[#60A5FA] dark:hover:bg-[#1E3A5F]">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 팀원 목록 */}
          {members.length === 0 ? (
            <p className="text-[10px] text-[#9CA3AF] pl-1 dark:text-[#6B7280]">팀원이 없습니다.</p>
          ) : (
            <ul className="space-y-0.5">
              {members.map(member => (
                <li key={member.id}
                  className="flex items-center gap-1.5 -mx-1 px-1 rounded-lg hover:bg-[#F9FAFB] py-1 transition-colors dark:hover:bg-[#374151]">
                  <InitialAvatar name={member.full_name} color={member.color} />
                  <span className="flex-1 text-xs text-[#374151] truncate dark:text-[#D1D5DB]">{member.full_name}</span>
                  <button title={`${member.full_name} 일정 보기`}
                    onClick={() => navigateFilter(`filter=member&userId=${member.id}&userName=${encodeURIComponent(member.full_name)}`)}
                    className="p-1 rounded text-[#9CA3AF] hover:text-[#2563EB] hover:bg-[#DBEAFE] transition-colors dark:text-[#6B7280] dark:hover:text-[#60A5FA] dark:hover:bg-[#1E3A5F]">
                    <Calendar className="h-3.5 w-3.5" />
                  </button>
                  <button title={`${member.full_name}에게 메시지`}
                    onClick={() => setMsgModal({ open: true, recipientId: member.id, recipientName: member.full_name })}
                    className="p-1 rounded text-[#9CA3AF] hover:text-[#2563EB] hover:bg-[#DBEAFE] transition-colors dark:text-[#6B7280] dark:hover:text-[#60A5FA] dark:hover:bg-[#1E3A5F]">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 사내 메시지 */}
      <div className="border-t border-[#E5E7EB] pt-4 dark:border-[#374151]">
        <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2 flex items-center gap-1 dark:text-[#9CA3AF]">
          <MessageSquare className="h-3 w-3" />
          사내 메시지
        </h3>
        <p className="text-[10px] text-[#9CA3AF] mb-2 dark:text-[#6B7280]">팀 구분 없이 사내 누구에게나 메시지를 보냅니다.</p>
        <RecipientSelect
          value={companyRecipient}
          onChange={setCompanyRecipient}
          placeholder="받을 사람 또는 팀 선택..."
          placement="top"
        />
        <button
          onClick={sendCompanyMessage}
          disabled={!companyRecipient}
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-medium py-2 px-3 hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:bg-[#3B82F6] dark:hover:bg-[#2563EB]"
        >
          <Send className="h-3.5 w-3.5" />
          메시지 보내기
        </button>
      </div>

      </div>{/* end 하단 고정 wrapper */}

      {/* 메시지 모달 */}
      <MessageModal
        isOpen={msgModal.open}
        onClose={() => setMsgModal({ open: false })}
        recipientId={msgModal.recipientId}
        recipientName={msgModal.recipientName}
        teamId={msgModal.teamId}
        teamName={msgModal.teamName}
      />
    </aside>
  )
}
