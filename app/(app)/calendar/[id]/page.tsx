import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Eye, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/avatar'
import { formatDateRange } from '@/lib/utils/dateFormat'
import { resolveEventColor } from '@/lib/utils/eventColor'
import { KakaoShareButton } from '@/components/share/KakaoShareButton'
import type { EventWithDetails } from '@/types/app'

const VISIBILITY_LABEL = { company: '전사 공개', team: '팀 공개', private: '나만 보기' }

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: event, error } = await supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name)`)
    .eq('id', id)
    .single()

  if (error || !event) notFound()

  const e = event as unknown as EventWithDetails & { team: { name: string } | null }
  const color = resolveEventColor({ color: e.color, category: e.category as any, author: e.author as any })

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Link href="/calendar" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#111827] mb-4">
        <ArrowLeft className="h-4 w-4" /> 캘린더로
      </Link>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-4 h-4 rounded-full mt-1 shrink-0" style={{ backgroundColor: color }} />
            <h1 className="text-xl font-bold text-[#111827]">{e.title}</h1>
          </div>
          <Badge variant="outline">{VISIBILITY_LABEL[e.visibility]}</Badge>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-[#6B7280]">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatDateRange(e.start_at, e.end_at, e.is_all_day)}</span>
          </div>
          {e.location && (
            <div className="flex items-center gap-2 text-[#6B7280]">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{e.location}</span>
            </div>
          )}
          {e.category && (
            <div className="flex items-center gap-2 text-[#6B7280]">
              <Tag className="h-4 w-4 shrink-0" />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: (e.category as any).color }} />
                {(e.category as any).name}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[#6B7280]">
            <Eye className="h-4 w-4 shrink-0" />
            <div className="flex items-center gap-1.5">
              <UserAvatar name={(e.author as any).full_name} color={(e.author as any).color} size={20} />
              <span>{(e.author as any).full_name}</span>
            </div>
          </div>
        </div>

        {e.description && (
          <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
            <p className="text-sm text-[#111827] whitespace-pre-wrap">{e.description}</p>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <KakaoShareButton type="event" id={e.id} title={e.title} />
        </div>
      </div>
    </div>
  )
}
