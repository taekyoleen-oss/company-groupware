import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/roles'

/** 휴가 대리 게시자(앱관리자 지정 1명) 여부 — 잘못 게시된 일정 정정을 위해 타인 일정 수정/삭제 허용 */
async function isVacationProxy(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('cg_company_settings')
    .select('vacation_proxy_user_id')
    .single()
  return (data as any)?.vacation_proxy_user_id === userId
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cg_events')
    .select(`*, category:cg_event_categories(id,name,color), author:cg_profiles!created_by(id,full_name,color,role,is_super_admin,approver_id), team:cg_teams(id,name)`)
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  const { data: event } = await supabase.from('cg_events').select('created_by, is_vacation').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = event.created_by === user.id
  const isAdmin = isSuperAdmin(profile)
  const isProxy = !isOwner && !isAdmin && await isVacationProxy(supabase, user.id)
  if (!isOwner && !isAdmin && !isProxy) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  // 휴가 이벤트는 수정 불가 (Admin 포함 — 취소 신청으로만 처리)
  // (이전엔 body._allow_vacation_patch 로 우회 가능한 죽은 플래그가 있었으나, 정당한 발신처가 없고
  //  spread 시 존재하지 않는 컬럼 UPDATE 로 오히려 500 을 유발해 제거함)
  const body = await request.json()
  if (event.is_vacation) {
    return NextResponse.json({ error: '확정된 휴가는 수정할 수 없습니다. 취소 신청을 이용해 주세요.' }, { status: 403 })
  }

  // 대리 게시자는 RLS(events_update: 소유자/관리자)에 걸리므로 service-role 로 실행.
  // 이벤트 조회는 사용자 세션으로 이미 통과했으므로(비공개 일정은 안 보임) 가시 범위 내 수정만 가능하다.
  const db = isProxy ? createAdminClient() : supabase
  const { data, error } = await db
    .from('cg_events')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('cg_profiles').select('role, is_super_admin').eq('id', user.id).single()
  const { data: event } = await supabase.from('cg_events').select('created_by, is_vacation').eq('id', id).single()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = event.created_by === user.id
  const isAdmin = isSuperAdmin(profile)
  const isProxy = !isOwner && !isAdmin && await isVacationProxy(supabase, user.id)
  if (!isOwner && !isAdmin && !isProxy) return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })

  // 확정된 휴가 이벤트는 직접 삭제 불가 — 취소 결재 흐름으로만 제거해 결재 우회를 막는다.
  // (PATCH 와 동일 정책. 예외적 정리는 앱관리자가 SQL Editor 로 수행.)
  if (event.is_vacation) {
    return NextResponse.json({ error: '확정된 휴가는 삭제할 수 없습니다. 취소 신청을 이용해 주세요.' }, { status: 403 })
  }

  // 대리 게시자의 삭제는 RLS(events_delete: 소유자/관리자)에 걸리므로 service-role 로 실행
  const db = isProxy ? createAdminClient() : supabase
  const { error } = await db.from('cg_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
