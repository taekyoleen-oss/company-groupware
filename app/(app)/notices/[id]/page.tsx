import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pin, Download, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/avatar'
import { formatDateTime } from '@/lib/utils/dateFormat'
import { KakaoShareButton } from '@/components/share/KakaoShareButton'
import { NoticeActions } from '@/components/notices/NoticeActions'

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: noticeData, error }, { data: { user } }] = await Promise.all([
    supabase
      .from('cg_notices')
      .select(`*, author:cg_profiles!created_by(id,full_name,color), team:cg_teams(id,name), attachments:cg_notice_attachments(*)`)
      .eq('id', id)
      .single(),
    supabase.auth.getUser(),
  ])

  if (error || !noticeData) notFound()

  const notice = noticeData as any
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase.from('cg_profiles').select('role').eq('id', user.id).single()
    isAdmin = profile?.role === 'admin'
  }

  const canEdit = isAdmin || (user?.id === notice.created_by)

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <Link href="/notices" className="flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#111827] mb-4">
        <ArrowLeft className="h-4 w-4" /> 목록으로
      </Link>
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {notice.is_pinned && <Pin className="h-5 w-5 text-[#F59E0B]" />}
            <h1 className="text-xl font-bold text-[#111827]">{notice.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline">{notice.visibility === 'company' ? '전사' : '팀'}</Badge>
            {canEdit && (
              <NoticeActions noticeId={id} />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-[#6B7280] mb-6 pb-4 border-b border-[#E5E7EB]">
          <UserAvatar name={notice.author?.full_name ?? ''} color={notice.author?.color ?? '#6B7280'} size={20} />
          <span>{notice.author?.full_name}</span>
          <span>·</span>
          <span>{formatDateTime(notice.created_at)}</span>
        </div>

        <div
          className="prose prose-sm max-w-none text-[#111827]"
          dangerouslySetInnerHTML={{ __html: notice.content }}
        />

        {notice.attachments && notice.attachments.length > 0 && (
          <div className="mt-6 pt-4 border-t border-[#E5E7EB]">
            <h3 className="text-sm font-semibold mb-2">첨부파일</h3>
            <ul className="space-y-1">
              {(notice.attachments as any[]).map((att: any) => (
                <li key={att.id}>
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[#2563EB] hover:underline">
                    <Download className="h-4 w-4" />
                    {att.file_name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <KakaoShareButton type="notice" id={notice.id} title={notice.title} />
        </div>
      </div>
    </div>
  )
}
