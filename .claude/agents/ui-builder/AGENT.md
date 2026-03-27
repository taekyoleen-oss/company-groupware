# ui-builder — UI/UX 구현 전문 에이전트

## 역할

페이지, 컴포넌트, TweakCN 커스터마이징을 담당한다.
DB 스키마나 API 로직 변경은 수행하지 않는다.

---

## 전제 조건

작업 전 반드시 확인:
1. `types/database.ts` 존재 여부
2. `app/api/` 관련 Route Handler 존재 여부

---

## 디자인 원칙

- **컬러 토큰** (설계서 4.2 기준)
```css
--primary:       #2563EB
--primary-soft:  #EFF6FF
--accent:        #10B981
--warning:       #F59E0B
--danger:        #EF4444
--text-primary:  #111827
--text-muted:    #6B7280
--border:        #E5E7EB
--background:    #F9FAFB
--surface:       #FFFFFF
```

- 라이트 모드 기본 (다크 모드 v2.0)
- 모바일 우선(Mobile-First) 반응형
- 한국어 UI

---

## 반응형 레이아웃

| 브레이크포인트 | 범위 | 주요 변화 |
|-------------|------|---------|
| mobile | < 768px | 하단 탭 바, 기본 탭: 캘린더, 모달 풀스크린 |
| tablet | 768px ~ 1024px | 사이드바 축소 |
| desktop | > 1024px | 사이드바 확장, 2~3 컬럼 |

---

## 사용자 아바타

이미지 업로드 없음. 이니셜 + 색상 원형으로 구현:

```tsx
// 사용자 12색 팔레트
const USER_COLORS = [
  '#EF4444','#F97316','#EAB308','#22C55E',
  '#10B981','#14B8A6','#3B82F6','#6366F1',
  '#8B5CF6','#EC4899','#F43F5E','#64748B'
]

function UserAvatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.4, fontWeight: 600 }}
    >
      {initials}
    </div>
  )
}
```

---

## 공통 레이아웃 (`app/(app)/layout.tsx`)

구현 우선순위 1번. 모든 인증된 페이지의 기반.

- PC: 헤더(로고·탭·프로필) + 사이드바(미니 캘린더 + 다가오는 3개 공개 일정) + 메인
- 모바일: 헤더(로고·메뉴) + 메인 + 하단 탭 바(기본 탭: 캘린더)
- 헤더에 알림 아이콘 없음 (v2.0 이월)

**사이드바 다가오는 일정**: company + team 공개 일정만, private 제외, 최대 3개

---

## 캘린더 페이지 (`app/(app)/calendar/page.tsx`)

### 라이브러리
`@fullcalendar/react` 권장. 스킬 참조: `.claude/skills/calendar-view/SKILL.md`

### 핵심 구현 사항
- **모바일 기본 뷰**: `month` (월 뷰)
- **빈 슬롯 클릭**: `dateClick` / `select` 이벤트로 해당 날짜·시간을 EventModal에 전달
```tsx
// FullCalendar dateClick 핸들러
const handleDateClick = (info: DateClickArg) => {
  setModalInitialDate(info.date)
  setEventModalOpen(true)
}
```
- **일정 충돌 감지 없음**: 중복 시간 허용, 검증 로직 추가 금지
- 색상 계산: `.claude/skills/color-token/SKILL.md` 참조

---

## 공지 게시판

### 탭 구조
```tsx
// '전체 공지 | 팀 공지' 2개 탭
<Tabs defaultValue="company">
  <TabsList>
    <TabsTrigger value="company">전체 공지</TabsTrigger>
    <TabsTrigger value="team">팀 공지</TabsTrigger>
  </TabsList>
</Tabs>
```

### 무한 스크롤
`IntersectionObserver` 기반으로 구현. `react-infinite-scroll-component` 라이브러리 사용 가능.

### 검색
공지 목록 상단 검색 input → API 쿼리 파라미터 `search` 전달 (debounce 300ms 적용)

### 핀 고정 표시
```tsx
{notice.is_pinned && (
  <Badge variant="outline" className="text-warning border-warning">
    📌 고정
  </Badge>
)}
```

### 첨부파일 업로드
공지 작성/수정 폼에서:
- 최대 3개, 파일당 10MB
- 허용 형식: `accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"`
- Supabase Storage `notice-attachments` 버킷으로 업로드

---

## 공지 에디터 (Tiptap)

```tsx
// components/notices/NoticeEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'

const editor = useEditor({
  extensions: [
    StarterKit,  // Bold, Italic, BulletList 포함
    Image.configure({ inline: true })
  ],
  content: initialContent,
})

// 이미지 업로드 핸들러: Supabase Storage에 업로드 후 URL 삽입
const handleImageUpload = async (file: File) => {
  const { data } = await supabase.storage
    .from('notice-images')
    .upload(`${Date.now()}-${file.name}`, file)
  if (data) {
    editor?.chain().focus().setImage({ src: getPublicUrl(data.path) }).run()
  }
}
```

툴바: Bold | Italic | 순서 없는 리스트 | 이미지 업로드 버튼만 구현

---

## TO-DO 드래그&드롭

`@dnd-kit/core` + `@dnd-kit/sortable` 라이브러리 사용 권장.

```tsx
// components/todo/TodoList.tsx
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'

// 드래그 완료 시 sort_order 일괄 업데이트
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event
  if (active.id !== over?.id) {
    // 새 순서 계산 후 PATCH /api/todos/reorder 호출
    const reordered = arrayMove(items, oldIndex, newIndex)
      .map((item, index) => ({ id: item.id, sort_order: index }))
    await fetch('/api/todos/reorder', { method: 'PATCH', body: JSON.stringify({ items: reordered }) })
  }
}
```

완료된 항목은 목록 하단 이동 (완료/미완료 그룹 분리 표시).

---

## 관리자 패널 (`app/admin/page.tsx`)

탭 구조:
1. **회원 관리** — 승인 대기 목록 + 전체 회원 목록, 팀 배정 모달
2. **팀 관리** — 팀 목록, 팀명 수정, 신규 팀 생성
3. **카테고리 관리** — 카테고리 목록, 추가/수정/삭제 (CategoryManager 컴포넌트)

```tsx
// components/admin/CategoryManager.tsx
// 카테고리 행: 색상 원 + 이름 + 수정/삭제 버튼
// 색상 선택: input type="color" 또는 고정 팔레트 선택 UI
```

---

## 카카오톡 공유 (`components/share/KakaoShareModal.tsx`)

공지 상세 + 일정 상세 양쪽에서 사용. 스킬 참조: `.claude/skills/kakao-share/SKILL.md`

```tsx
interface KakaoShareModalProps {
  type: 'event' | 'notice'
  data: EventDetail | NoticeDetail
  isOpen: boolean
  onClose: () => void
}
```

---

## 미니 프로필 팝오버

사용자 이름 클릭 시 표시:
```tsx
<Popover>
  <PopoverTrigger>{author.full_name}</PopoverTrigger>
  <PopoverContent className="w-48">
    <UserAvatar name={author.full_name} color={author.color} />
    <p className="font-medium">{author.full_name}</p>
    <p className="text-sm text-muted">{author.role === 'admin' ? '관리자' : author.role === 'manager' ? '팀장' : '팀원'}</p>
    <p className="text-sm text-muted">{author.team?.name ?? '팀 미배정'}</p>
  </PopoverContent>
</Popover>
```

---

## TweakCN 커스터마이징

| 컴포넌트 | 변경 사항 |
|---------|---------|
| `Button` | primary 색상 `--primary`, 라운딩 `rounded-lg` |
| `Card` | `border-[--border] shadow-sm hover:shadow-md transition-shadow` |
| `Badge` | 이벤트 카테고리 동적 배경색 |
| `Dialog/Modal` | 모바일에서 `fixed bottom-0` bottom-sheet 변환 |
| `Avatar` | 이니셜 아바타 (이미지 없음) |

---

## 완료 체크리스트

- [ ] 공통 레이아웃 (헤더·사이드바·하단탭) 구현
- [ ] 인증 페이지 3개 (login·signup·pending) 구현
- [ ] 캘린더 메인 (월 뷰 기본, 빈 슬롯 클릭, 색상 표시) 구현
- [ ] EventModal (날짜 자동 입력, 공개 범위 선택) 구현
- [ ] 공지 게시판 목록 (탭·무한스크롤·검색·핀 표시) 구현
- [ ] 공지 작성/수정 (Tiptap 에디터·첨부파일) 구현
- [ ] 공지 상세 (카카오 공유 버튼) 구현
- [ ] TO-DO 페이지 (드래그&드롭 정렬) 구현
- [ ] 관리자 패널 (회원·팀·카테고리 탭) 구현
- [ ] 프로필 페이지 (색상 변경, 팀 정보) 구현
- [ ] 카카오 공유 모달 (공지/이벤트 공통) 구현
- [ ] 미니 프로필 팝오버 구현
- [ ] 모바일 375px Lighthouse 모바일 점수 ≥ 85 확인
