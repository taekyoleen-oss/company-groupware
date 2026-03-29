import PptxGenJS from 'pptxgenjs'
import fs from 'fs'
import path from 'path'

const pptx = new PptxGenJS()
pptx.layout  = 'LAYOUT_WIDE'
pptx.author  = '사내 그룹웨어'
pptx.company = '바이브코딩랩'

const C = {
  headerBg: '1E3A5F', primary: '2563EB', dark: '111827',
  body: '374151', sub: '6B7280', cardBg: 'F9FAFB',
  border: 'E5E7EB', white: 'FFFFFF', lightBlue: 'EFF6FF',
  blueBdr: 'BFDBFE', divider: 'D1D5DB',
}
const F  = 'Noto Sans KR'
const FE = 'Segoe UI Emoji'
const SS = './scripts/screenshots'

const hasImg  = name => fs.existsSync(path.join(SS, `${name}.png`))
const imgPath = name => path.join(SS, `${name}.png`)

const addSlide = () => { const s = pptx.addSlide(); s.background = { fill: C.white }; return s }

const addHeader = (s, num, title) => {
  s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:13.33, h:1.1, fill:{color:C.headerBg}, line:{type:'none'} })
  s.addText(`${num}  ${title}`, { x:0.45, y:0, w:12.4, h:1.1, fontSize:32, bold:true, color:C.white, fontFace:F, valign:'middle' })
}

const addCard = (s, x, y, w, h, opts={}) =>
  s.addShape(pptx.ShapeType.rect, { x,y,w,h, fill:{color:opts.bg||C.cardBg}, line:{color:opts.border||C.border,pt:1}, rectRadius:0.1 })

const hr = (s,x,y,w) =>
  s.addShape(pptx.ShapeType.rect, { x,y,w,h:0.03, fill:{color:C.divider}, line:{type:'none'} })

// ── 스크린샷 슬라이드: 왼쪽 이미지 + 하단 경로·설명 + 오른쪽 텍스트 ──
// route: 앱 경로 (예: /calendar), caption: 화면 한 줄 설명
const addScreenSlide = (num, title, imgName, points, route='', caption='') => {
  const s = addSlide()
  addHeader(s, num, title)
  const hasShot = hasImg(imgName)

  if (hasShot) {
    // 스크린샷 (높이 축소해 하단 여백 확보)
    s.addShape(pptx.ShapeType.rect, { x:0.35, y:1.25, w:6.8, h:5.1, fill:{color:C.cardBg}, line:{color:C.border,pt:1}, rectRadius:0.1 })
    s.addImage({ path: imgPath(imgName), x:0.45, y:1.32, w:6.6, h:4.95 })
    // 하단: 경로 + 한 줄 설명
    if (route) s.addText(`📍 ${route}`, { x:0.45, y:6.35, w:6.6, h:0.28, fontSize:14, color:C.sub, fontFace:F })
    if (caption) s.addText(caption,     { x:0.45, y:6.63, w:6.6, h:0.25, fontSize:13, color:C.sub, fontFace:F, italic:true })
    // 오른쪽: 기능 설명
    const rx = 7.4
    points.forEach((pt, i) => {
      addCard(s, rx, 1.3 + i * 1.42, 5.55, 1.25, { bg:C.white })
      s.addText(pt.icon,  { x:rx+0.18, y:1.3+i*1.42+0.18, w:0.75, h:0.75, fontSize:24, align:'center', fontFace:FE })
      s.addText(pt.title, { x:rx+1.05, y:1.3+i*1.42+0.12, w:4.3,  h:0.42, fontSize:20, bold:true, color:C.dark, fontFace:F })
      s.addText(pt.desc,  { x:rx+1.05, y:1.3+i*1.42+0.58, w:4.3,  h:0.52, fontSize:17, color:C.body, fontFace:F })
    })
  } else {
    points.forEach((pt, i) => {
      const col = i % 2, row = Math.floor(i / 2)
      const x = 0.4 + col * 6.45, y = 1.3 + row * 2.85
      addCard(s, x, y, 6.1, 2.6, { bg:C.white })
      s.addText(pt.icon,  { x:x+0.2,  y:y+0.2,  w:0.8,  h:0.8,  fontSize:26, align:'center', fontFace:FE })
      s.addText(pt.title, { x:x+1.1,  y:y+0.18, w:4.8,  h:0.5,  fontSize:22, bold:true, color:C.dark, fontFace:F })
      s.addText(pt.desc,  { x:x+0.28, y:y+0.78, w:5.65, h:1.45, fontSize:19, color:C.body, fontFace:F })
    })
  }
  return s
}

// ══════════════════════════════════════════════════════
// 1. 표지
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.18, h:7.5, fill:{color:C.primary}, line:{type:'none'} })
  s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:13.33, h:0.18, fill:{color:C.headerBg}, line:{type:'none'} })
  s.addText('사내 그룹웨어', { x:0.5, y:1.5, w:12, h:1.4, fontSize:54, bold:true, color:C.headerBg, fontFace:F })
  hr(s, 0.5, 3.05, 5.5)
  s.addText('일정 관리 · 공지 게시판 · TO-DO · 팀 협업', { x:0.5, y:3.2, w:12, h:0.6, fontSize:24, color:C.body, fontFace:F })
  s.addText('소규모 회사를 위한 통합 업무 관리 솔루션', { x:0.5, y:3.95, w:12, h:0.45, fontSize:20, color:C.sub, fontFace:F })
  const badges = ['캘린더', '공지사항', 'TO-DO', '팀 관리', '권한 보안']
  badges.forEach((b, i) => {
    const x = 0.5 + i * 2.42
    s.addShape(pptx.ShapeType.rect, { x, y:5.0, w:2.18, h:0.52, fill:{color:C.lightBlue}, line:{color:C.blueBdr,pt:1}, rectRadius:0.26 })
    s.addText(b, { x, y:5.0, w:2.18, h:0.52, fontSize:18, bold:true, color:C.primary, fontFace:F, align:'center', valign:'middle' })
  })
  s.addText('바이브코딩랩', { x:0.5, y:6.75, w:5, h:0.38, fontSize:18, color:C.sub, fontFace:F })
}

// ══════════════════════════════════════════════════════
// 2. 목차
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  addHeader(s, '', '목차')
  const items = [
    { no:'01', title:'프로젝트 개요',      sub:'앱 목적 · 핵심 기능 요약' },
    { no:'02', title:'로그인 & 가입',      sub:'인증 흐름 · 승인 절차' },
    { no:'03', title:'캘린더',             sub:'일정 관리 · 뷰 전환 · 드래그' },
    { no:'04', title:'공지사항',           sub:'에디터 · 첨부 · 핀 고정' },
    { no:'05', title:'TO-DO',             sub:'드래그 정렬 · 완료 관리' },
    { no:'06', title:'메시징 & 공유',      sub:'팀 메시지 · 카카오 공유' },
    { no:'07', title:'관리자 패널',        sub:'사용자·팀·카테고리 관리' },
    { no:'08', title:'모바일 지원',        sub:'반응형 · 하단 탭바' },
    { no:'09', title:'기술 스택 & 보안',   sub:'Next.js · Supabase · RLS' },
  ]
  items.forEach((item, i) => {
    const col = i < 5 ? 0 : 1
    const row = i < 5 ? i : i - 5
    const x = col === 0 ? 0.4 : 6.9
    const y = 1.3 + row * 1.2
    s.addShape(pptx.ShapeType.rect, { x, y:y+0.04, w:0.7, h:0.7, fill:{color:C.primary}, line:{type:'none'}, rectRadius:0.08 })
    s.addText(item.no, { x, y:y+0.04, w:0.7, h:0.7, fontSize:17, bold:true, color:C.white, fontFace:F, align:'center', valign:'middle' })
    s.addText(item.title, { x:x+0.88, y:y+0.04, w:5.5, h:0.36, fontSize:20, bold:true, color:C.dark, fontFace:F })
    s.addText(item.sub,   { x:x+0.88, y:y+0.42, w:5.5, h:0.28, fontSize:16, color:C.sub, fontFace:F })
    hr(s, x, y+0.82, 6.2)
  })
}

// ══════════════════════════════════════════════════════
// 3. 프로젝트 개요
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  addHeader(s, '01', '프로젝트 개요')
  s.addText('소규모 회사 대상 통합 업무 관리 솔루션', { x:0.45, y:1.25, w:12.4, h:0.55, fontSize:26, bold:true, color:C.dark, fontFace:F })
  s.addText('일정·공지·TO-DO를 하나의 앱으로 통합  /  PC·모바일 완전 반응형  /  역할 기반 권한 제어', { x:0.45, y:1.88, w:12.4, h:0.45, fontSize:20, color:C.body, fontFace:F })
  hr(s, 0.45, 2.45, 12.4)
  const cards = [
    { icon:'📅', title:'캘린더',    pts:['월/주/일/+7일 뷰', '드래그&드롭 일정 이동', '한국 공휴일 자동 표시'] },
    { icon:'📢', title:'공지사항',  pts:['Tiptap 리치 에디터', '첨부파일 3개 업로드', '핀 고정 (전사·팀 각 3개)'] },
    { icon:'✅', title:'TO-DO',     pts:['드래그 우선순위 정렬', '완료 체크·섹션 분리', '개인 전용 데이터'] },
    { icon:'🔒', title:'권한 보안', pts:['Admin·Manager·Member', 'PostgreSQL RLS 적용', '미들웨어 라우트 보호'] },
  ]
  cards.forEach((c, i) => {
    const x = 0.45 + i * 3.15
    addCard(s, x, 2.65, 2.9, 4.55)
    s.addText(c.icon,  { x, y:2.82, w:2.9, h:0.7, fontSize:28, align:'center', fontFace:FE })
    s.addText(c.title, { x:x+0.1, y:3.58, w:2.7, h:0.48, fontSize:22, bold:true, color:C.dark, fontFace:F, align:'center' })
    hr(s, x+0.3, 4.1, 2.3)
    c.pts.forEach((pt, pi) =>
      s.addText(`• ${pt}`, { x:x+0.15, y:4.2+pi*0.6, w:2.62, h:0.5, fontSize:18, color:C.body, fontFace:F })
    )
  })
}

// ══════════════════════════════════════════════════════
// 4. 로그인 & 가입
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  addHeader(s, '02', '로그인 & 회원가입')
  if (hasImg('01_login')) {
    s.addShape(pptx.ShapeType.rect, { x:1.2, y:1.25, w:5.5, h:5.1, fill:{color:C.cardBg}, line:{color:C.border,pt:1}, rectRadius:0.1 })
    s.addImage({ path: imgPath('01_login'), x:1.3, y:1.32, w:5.3, h:4.95 })
    s.addText('📍 /login', { x:1.3, y:6.35, w:5.3, h:0.28, fontSize:14, color:C.sub, fontFace:F })
    s.addText('이메일·비밀번호 입력 폼, 로그인 버튼, 회원가입 링크', { x:1.3, y:6.63, w:5.3, h:0.25, fontSize:13, color:C.sub, fontFace:F, italic:true })
  }
  const rx = 7.3
  const pts = [
    { icon:'📧', title:'이메일 로그인',  desc:'이메일·비밀번호로 즉시 로그인' },
    { icon:'📝', title:'회원가입',       desc:'이름·이메일·비밀번호·팀 선택\n→ 관리자 승인 대기(pending)' },
    { icon:'✅', title:'관리자 승인',    desc:'Admin이 상태를 active로 변경\n→ 즉시 서비스 이용 가능' },
    { icon:'🚫', title:'비활성 계정',    desc:'inactive 계정 — 로그인 즉시 차단\nAdmin이 직접 상태 관리' },
  ]
  pts.forEach((pt, i) => {
    addCard(s, rx, 1.3+i*1.56, 5.65, 1.38, { bg:C.white })
    s.addText(pt.icon,  { x:rx+0.18, y:1.3+i*1.56+0.22, w:0.75, h:0.75, fontSize:22, align:'center', fontFace:FE })
    s.addText(pt.title, { x:rx+1.05, y:1.3+i*1.56+0.12, w:4.4,  h:0.42, fontSize:20, bold:true, color:C.dark, fontFace:F })
    s.addText(pt.desc,  { x:rx+1.05, y:1.3+i*1.56+0.58, w:4.4,  h:0.62, fontSize:17, color:C.body, fontFace:F })
  })
}

// ══════════════════════════════════════════════════════
// 5. 캘린더 — 월 뷰
// ══════════════════════════════════════════════════════
addScreenSlide('03', '캘린더', '02_calendar_month', [
  { icon:'🗓', title:'4가지 뷰',         desc:'월(기본)·주·일·+7일 / 09:00부터 표시' },
  { icon:'🖱', title:'드래그&드롭 이동', desc:'날짜·시간 즉시 변경 / DB 자동 저장' },
  { icon:'🗾', title:'한국 공휴일',      desc:'법정 공휴일 빨간색 자동 표시' },
  { icon:'🔍', title:'필터링',           desc:'팀 일정만·멤버별·전사 포함/제외' },
], '/calendar', '월간 달력 그리드, 일정 색상 블록, 뷰 전환 버튼, 사이드바 다가오는 일정')

// ══════════════════════════════════════════════════════
// 6. 캘린더 — 주 뷰
// ══════════════════════════════════════════════════════
addScreenSlide('03', '캘린더 — 공개 범위 & 알림', '03_calendar_week', [
  { icon:'👁', title:'공개 범위 제어',  desc:'전사·팀·나만 보기 3단계 선택' },
  { icon:'🎨', title:'색상·카테고리', desc:'카테고리 자동 색상 / 개인 커스텀' },
  { icon:'🔔', title:'일정 생성 알림', desc:'팀·전사 대상 메시지 알림 발송 옵션' },
  { icon:'📊', title:'사이드바',       desc:'다가오는 공개 일정 3개 미리보기' },
], '/calendar', '7일 타임라인, 시간대별 일정 블록, 드래그&드롭으로 시간·날짜 이동')

// ══════════════════════════════════════════════════════
// 7. 공지사항 목록
// ══════════════════════════════════════════════════════
addScreenSlide('04', '공지사항 — 목록 & 검색', '04_notices_list', [
  { icon:'📌', title:'핀 고정',        desc:'전사 3개·팀 3개 상한 / Manager 이상' },
  { icon:'🔎', title:'제목 검색',      desc:'실시간 검색 / 무한 스크롤 20개' },
  { icon:'🗂', title:'전사·팀 탭',     desc:'탭 전환으로 대상 공지 즉시 분리' },
  { icon:'🔐', title:'접근 제어',      desc:'팀 공지 — 해당 팀원만 조회 가능' },
], '/notices', '핀 고정 공지, 전사/팀 탭, 공지 목록(제목·작성자·날짜), 검색창')

// ══════════════════════════════════════════════════════
// 8. 공지사항 작성
// ══════════════════════════════════════════════════════
addScreenSlide('04', '공지사항 — 작성 & 첨부', '06_notice_new', [
  { icon:'✏️', title:'Tiptap 에디터', desc:'Bold·Italic·리스트·이미지 인라인 삽입' },
  { icon:'📎', title:'첨부파일',       desc:'공지당 3개·10MB / 이미지·PDF·Office' },
  { icon:'📤', title:'카카오 공유',    desc:'상세 화면 → 1클릭 공유·클립보드 복사' },
  { icon:'🔏', title:'수정·삭제 권한', desc:'작성자 본인 / Admin — 모든 공지 가능' },
], '/notices/new', '제목·대상 선택, Tiptap 리치 에디터, 첨부파일 업로드 영역, 저장 버튼')

// ══════════════════════════════════════════════════════
// 9. TO-DO
// ══════════════════════════════════════════════════════
addScreenSlide('05', 'TO-DO', '07_todo', [
  { icon:'➕', title:'빠른 추가',      desc:'입력 후 엔터 / 마감일 선택 가능' },
  { icon:'↕️', title:'드래그 정렬',   desc:'dnd-kit / sort_order DB 즉시 반영' },
  { icon:'☑️', title:'완료 체크',      desc:'취소선·완료 섹션 이동 / 섹션 분리' },
  { icon:'🔒', title:'개인 전용',      desc:'RLS — Admin 포함 타인 접근 불가' },
], '/todo', '할일 입력창, 드래그 핸들·체크박스·마감일, 완료/진행 중 섹션 분리')

// ══════════════════════════════════════════════════════
// 10. 메시징 & 공유
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  addHeader(s, '06', '메시징 & 공유')
  const items = [
    { icon:'💬', title:'팀·개인 메시지',  desc:'개인 또는 팀 전체 대상 발송\n발신·수신 내역 목록 조회' },
    { icon:'🔔', title:'실시간 알림',     desc:'신규 메시지 → 앱 내 알림 패널\n일정 알림도 메시지로 통합' },
    { icon:'🔁', title:'전달·수정·삭제', desc:'수신 메시지 타 팀원·팀에 전달\n발송 메시지 수정·삭제 지원' },
    { icon:'📲', title:'카카오 공유',     desc:'일정·공지 → 1클릭 카카오톡 공유\n제목·일시·작성자 자동 포맷' },
  ]
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.4 + col * 6.45, y = 1.3 + row * 2.85
    addCard(s, x, y, 6.1, 2.6, { bg:C.white })
    s.addText(it.icon,  { x:x+0.2,  y:y+0.2,  w:0.8,  h:0.8,  fontSize:26, align:'center', fontFace:FE })
    s.addText(it.title, { x:x+1.1,  y:y+0.18, w:4.8,  h:0.5,  fontSize:22, bold:true, color:C.dark, fontFace:F })
    s.addText(it.desc,  { x:x+0.28, y:y+0.78, w:5.65, h:1.45, fontSize:19, color:C.body, fontFace:F })
  })
}

// ══════════════════════════════════════════════════════
// 11. 관리자 패널
// ══════════════════════════════════════════════════════
addScreenSlide('07', '관리자 패널', '09_admin', [
  { icon:'👤', title:'사용자 관리', desc:'승인·역할 변경·팀 배정·비활성화' },
  { icon:'🏢', title:'팀 관리',    desc:'팀 생성·삭제 / 멤버 현황 확인' },
  { icon:'🏷', title:'카테고리',   desc:'일정 카테고리 추가·수정·삭제' },
  { icon:'🔑', title:'Admin 전용', desc:'복수 Admin 허용 / 모든 데이터 관리' },
], '/admin', '사용자 목록·승인·역할/팀 변경, 팀 관리 탭, 카테고리 관리 탭')

// ══════════════════════════════════════════════════════
// 12. 모바일 지원
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  addHeader(s, '08', '모바일 지원')
  if (hasImg('10_mobile_calendar')) {
    s.addShape(pptx.ShapeType.rect, { x:0.4, y:1.25, w:3.5, h:5.1, fill:{color:C.cardBg}, line:{color:C.border,pt:1}, rectRadius:0.1 })
    s.addImage({ path: imgPath('10_mobile_calendar'), x:0.5, y:1.32, w:3.3, h:4.95 })
    s.addText('📍 /calendar  (390px)', { x:0.5, y:6.35, w:3.3, h:0.28, fontSize:13, color:C.sub, fontFace:F })
    s.addText('모바일 월 뷰, 하단 탭바', { x:0.5, y:6.63, w:3.3, h:0.25, fontSize:12, color:C.sub, fontFace:F, italic:true })
  }
  if (hasImg('11_mobile_todo')) {
    s.addShape(pptx.ShapeType.rect, { x:4.2, y:1.25, w:3.5, h:5.1, fill:{color:C.cardBg}, line:{color:C.border,pt:1}, rectRadius:0.1 })
    s.addImage({ path: imgPath('11_mobile_todo'), x:4.3, y:1.32, w:3.3, h:4.95 })
    s.addText('📍 /todo  (390px)', { x:4.3, y:6.35, w:3.3, h:0.28, fontSize:13, color:C.sub, fontFace:F })
    s.addText('모바일 TO-DO 목록, 하단 탭바', { x:4.3, y:6.63, w:3.3, h:0.25, fontSize:12, color:C.sub, fontFace:F, italic:true })
  }
  const rx = 8.1
  const pts = [
    { icon:'📱', title:'완전 반응형',   desc:'375px~1920px 모든 화면 지원' },
    { icon:'⬇️', title:'하단 탭바',    desc:'캘린더·공지·TO-DO·프로필 탭' },
    { icon:'📅', title:'기본 뷰: 월',   desc:'모바일 기본 — 월 뷰 자동 적용' },
    { icon:'👆', title:'터치 최적화',   desc:'버튼 크기·간격 모바일 기준 설계' },
  ]
  pts.forEach((pt, i) => {
    addCard(s, rx, 1.3+i*1.56, 4.85, 1.38, { bg:C.white })
    s.addText(pt.icon,  { x:rx+0.18, y:1.3+i*1.56+0.22, w:0.75, h:0.75, fontSize:22, align:'center', fontFace:FE })
    s.addText(pt.title, { x:rx+1.05, y:1.3+i*1.56+0.12, w:3.6,  h:0.42, fontSize:20, bold:true, color:C.dark, fontFace:F })
    s.addText(pt.desc,  { x:rx+1.05, y:1.3+i*1.56+0.58, w:3.6,  h:0.62, fontSize:17, color:C.body, fontFace:F })
  })
}

// ══════════════════════════════════════════════════════
// 13. 기술 스택 & 보안
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  addHeader(s, '09', '기술 스택 & 보안')
  const stacks = [
    { icon:'⚡', name:'Next.js 15',     desc:'App Router · SSR · API Routes' },
    { icon:'🔐', name:'Supabase',       desc:'PostgreSQL · Auth · RLS · Storage' },
    { icon:'🚀', name:'Vercel',         desc:'서버리스 배포 · CDN · Edge' },
    { icon:'🎨', name:'TailwindCSS 4',  desc:'Utility CSS · 완전 반응형' },
    { icon:'📅', name:'FullCalendar 6', desc:'월/주/일 뷰 · 드래그&드롭' },
    { icon:'✏️', name:'Tiptap 3',       desc:'리치 에디터 · 이미지 업로드' },
  ]
  stacks.forEach((st, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const x = 0.4 + col * 4.25, y = 1.3 + row * 1.45
    addCard(s, x, y, 3.95, 1.25, { bg:C.white })
    s.addText(st.icon, { x:x+0.15, y:y+0.2,  w:0.75, h:0.8,  fontSize:26, align:'center', fontFace:FE })
    s.addText(st.name, { x:x+1.05, y:y+0.12, w:2.7,  h:0.45, fontSize:20, bold:true, color:C.primary, fontFace:F })
    s.addText(st.desc, { x:x+1.05, y:y+0.6,  w:2.7,  h:0.45, fontSize:17, color:C.body, fontFace:F })
  })
  hr(s, 0.4, 4.45, 12.5)
  s.addText('🔒  3중 보안 레이어', { x:0.5, y:4.55, w:12, h:0.42, fontSize:20, bold:true, color:C.primary, fontFace:F })
  addCard(s, 0.4, 5.05, 12.5, 1.4, { bg:C.lightBlue, border:C.blueBdr })
  const secItems = [
    { step:'1', text:'Supabase Auth — 이메일 인증·세션 관리' },
    { step:'2', text:'Next.js Middleware — 라우트 보호·pending·inactive 차단' },
    { step:'3', text:'PostgreSQL RLS — 행 단위 접근 제어·역할별 데이터 격리' },
  ]
  secItems.forEach((it, i) => {
    s.addShape(pptx.ShapeType.rect, { x:0.65+i*4.12, y:5.18, w:0.42, h:0.42, fill:{color:C.primary}, line:{type:'none'}, rectRadius:0.21 })
    s.addText(it.step, { x:0.65+i*4.12, y:5.18, w:0.42, h:0.42, fontSize:16, bold:true, color:C.white, fontFace:F, align:'center', valign:'middle' })
    s.addText(it.text, { x:1.2+i*4.12,  y:5.18, w:3.6,  h:1.0,  fontSize:18, color:C.body, fontFace:F })
  })
}

// ══════════════════════════════════════════════════════
// 14. 마무리
// ══════════════════════════════════════════════════════
{
  const s = addSlide()
  s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.18, h:7.5, fill:{color:C.primary}, line:{type:'none'} })
  s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:13.33, h:0.18, fill:{color:C.headerBg}, line:{type:'none'} })
  s.addText('감사합니다', { x:0.5, y:1.2, w:12, h:1.2, fontSize:54, bold:true, color:C.headerBg, fontFace:F })
  hr(s, 0.5, 2.55, 5.5)
  s.addText('사내 그룹웨어로 팀 협업을 더 스마트하게', { x:0.5, y:2.72, w:12, h:0.55, fontSize:24, color:C.body, fontFace:F })
  const summary = [
    { label:'핵심 기능', value:'캘린더 · 공지사항 · TO-DO · 메시지 · 관리자 패널' },
    { label:'기술 스택', value:'Next.js 15 · Supabase · Vercel · TailwindCSS 4' },
    { label:'보안',      value:'Supabase Auth · Next.js Middleware · PostgreSQL RLS' },
    { label:'접근성',    value:'PC + 모바일 완전 반응형 · 3단계 역할 기반 권한' },
  ]
  summary.forEach((row, i) => {
    const y = 3.55 + i * 0.9
    addCard(s, 0.5, y, 12.3, 0.76, { bg:C.cardBg })
    s.addText(row.label, { x:0.7, y, w:2.4, h:0.76, fontSize:20, bold:true, color:C.primary, fontFace:F, valign:'middle' })
    s.addText(row.value, { x:3.2, y, w:9.4, h:0.76, fontSize:20, color:C.dark,               fontFace:F, valign:'middle' })
  })
  s.addText('바이브코딩랩  ·  vibecodinglab.ai.kr', { x:0.5, y:7.12, w:8, h:0.35, fontSize:16, color:C.sub, fontFace:F })
}

// 기존 Presentation.pptx가 있으면 번호를 붙여 보존 (열려 있으면 건너뜀)
const outFile = 'Presentation.pptx'
if (fs.existsSync(outFile)) {
  try {
    let n = 1
    while (fs.existsSync(`Presentation_${n}.pptx`)) n++
    fs.renameSync(outFile, `Presentation_${n}.pptx`)
    console.log(`  기존 파일 보존: Presentation_${n}.pptx`)
  } catch {
    console.log('  기존 파일이 열려 있어 보존 건너뜀 — 덮어씁니다')
  }
}

await pptx.writeFile({ fileName: outFile })
console.log('PPT 생성 완료: Presentation.pptx')
