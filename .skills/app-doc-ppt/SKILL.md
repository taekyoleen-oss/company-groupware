---
name: app-doc-ppt
description: >
  앱 폴더를 자동으로 분석해서 기능 설명 및 사용 방법 PPT를 생성하는 스킬.
  사용자가 "앱 설명 PPT 만들어줘", "이 앱 프레젠테이션 만들어줘", "앱 문서화해줘",
  "PPT로 정리해줘", "앱 소개 자료 만들어줘" 등을 말하면 반드시 이 스킬을 사용하라.
  Next.js 기반 앱에 최적화되어 있으며, 폴더/파일 구조를 스캔해서 기술 스택,
  주요 기능, 사용 방법을 자동 추출한 뒤 디자인된 .pptx 파일로 출력한다.
  앱 폴더 내 어디에 위치해 있어도 작동하며, 별도의 문서 없이 코드 구조만으로도 PPT를 생성할 수 있다.
---

# app-doc-ppt 스킬

앱의 폴더/파일 구조를 분석해서 **기능 설명 + 사용 방법 PPT**를 자동 생성한다.
PPT 실제 생성은 반드시 `/mnt/skills/public/pptx/SKILL.md`를 읽고 그 지침을 따른다.

---

## 워크플로우

### Step 1 — 분석 대상 경로 확인

스킬이 위치한 폴더가 곧 분석 대상 앱의 루트다.
스킬 파일 경로에서 앱 루트를 결정한다.

```bash
# 현재 스킬 위치 기준 앱 루트 탐색
# 예: /projects/my-app/app-doc-ppt/SKILL.md → 앱 루트: /projects/my-app/
```

사용자가 경로를 별도로 지정하면 그 경로를 우선 사용한다.

---

### Step 2 — 폴더 구조 스캔

```bash
# 전체 구조 파악 (depth 3)
find <APP_ROOT> -maxdepth 3 \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*" \
  -not -path "*/__pycache__/*" \
  | head -100

# 주요 설정 파일 확인
ls <APP_ROOT>
cat <APP_ROOT>/package.json 2>/dev/null
cat <APP_ROOT>/README.md 2>/dev/null | head -80
```

---

### Step 3 — 앱 정보 추출

아래 우선순위로 정보를 수집한다.

| 추출 항목 | 소스 파일 |
|---|---|
| 앱 이름 / 목적 | `README.md`, `package.json` → `name`, `description` |
| 기술 스택 | `package.json` → `dependencies`, `devDependencies` |
| 주요 페이지/기능 | `app/` 또는 `pages/` 폴더 구조 (Next.js 라우팅) |
| API 엔드포인트 | `app/api/` 또는 `pages/api/` |
| 환경 변수 / 외부 서비스 | `.env.example`, `.env.local.example` |
| 컴포넌트 구성 | `components/` 폴더 |

**Next.js 앱 감지 기준**: `package.json`에 `"next"` 의존성이 있거나, `app/` 또는 `pages/` 폴더가 존재하면 Next.js 앱으로 판단한다.

**기타 프레임워크**: `vite`, `react-scripts`, `express`, `fastapi` 등도 동일하게 `package.json` 또는 `requirements.txt`에서 감지한다.

---

### Step 4 — 스크린샷 촬영 (puppeteer)

PPT에 실제 앱 화면을 삽입한다. `scripts/capture-screens.mjs` 스크립트를 실행해 `scripts/screenshots/` 폴더에 저장한다.

```bash
node scripts/capture-screens.mjs
```

**캡처 대상 페이지 (기본)**:
| 파일명 | 설명 |
|---|---|
| `01_login.png` | 로그인 화면 |
| `02_calendar_month.png` | 캘린더 월 뷰 |
| `03_calendar_week.png` | 캘린더 주 뷰 |
| `04_notices_list.png` | 공지사항 목록 |
| `05_notice_detail.png` | 공지사항 상세 |
| `06_notice_new.png` | 공지사항 작성 |
| `07_todo.png` | TO-DO 페이지 |
| `08_profile.png` | 프로필 페이지 |
| `09_admin.png` | 관리자 패널 |
| `10_mobile_calendar.png` | 모바일 캘린더 |
| `11_mobile_todo.png` | 모바일 TO-DO |

**인증 방식**: `screenshot-bypass` 스킬 참조 (개발 전용 magic link 세션 발급)

**스크린샷 처리 원칙**:
- 스크린샷 파일이 **존재하면** 반드시 PPT에 삽입한다 (내용이 잘못된 경우 포함)
- 스크린샷 파일이 **없으면** 해당 슬라이드에 "📸 화면 캡처 준비 중" 텍스트 박스로 대체한다
- **모든 스크린샷 슬라이드 바로 다음에 화면 설명 슬라이드를 1장 추가한다** (아래 Step 5 참조)

---

### Step 5 — 슬라이드 콘텐츠 계획

**기본 원칙**:
- 기술 스택·시스템 아키텍처·DB 스키마는 **별도 요청이 없으면 요약 1장만** 포함한다
- **기능·사용법 중심**으로 슬라이드를 구성한다
- 각 기능 슬라이드는 **스크린샷 + 설명 텍스트** 조합으로 구성한다
  - 왼쪽 40~50%: 스크린샷 이미지 (addImage 사용)
  - 오른쪽 50~60%: 개조식 단문 설명 (아이콘·제목·포인트 3~4개)
- 스크린샷이 없는 경우: 전체 폭 설명 카드 레이아웃으로 대체

#### 📸 스크린샷 슬라이드 하단 경로·설명 표시

별도 설명 슬라이드를 만들지 않는다.
대신 스크린샷 이미지 **아래 여백에 직접** 경로와 한 줄 설명을 표시한다.

**레이아웃 변경 규칙**:
- 스크린샷 높이를 약간 줄여 하단 여백 확보 (h: 5.7 → 4.8)
- 스크린샷 아래 공간에 2줄 표시:
  - 첫째 줄: `📍 경로` — 회색 소문자 (예: `/calendar`)
  - 둘째 줄: 화면의 주요 UI 요소 한 줄 요약 (예: `월간 달력 그리드 · 일정 색상 블록 · 뷰 전환 버튼`)
- 파일명도 작은 글씨로 병기: `(scripts/screenshots/02_calendar_month.png)`

**구현 예시 (pptxgenjs)**:
```javascript
// 스크린샷 (높이 축소)
s.addImage({ path: imgPath(imgName), x:0.45, y:1.35, w:6.6, h:4.8 })
// 경로
s.addText(`📍 ${route}`, { x:0.45, y:6.25, w:6.6, h:0.32, fontSize:15, color:C.sub, fontFace:F })
// 한 줄 설명
s.addText(caption, { x:0.45, y:6.58, w:6.6, h:0.28, fontSize:14, color:C.sub, fontFace:F, italic:true })
```

**각 화면별 경로·설명 값**:
| 슬라이드 | route | caption | 파일명 |
|---|---|---|---|
| 로그인 | `/login` | 이메일·비밀번호 입력 폼, 회원가입 링크 | `01_login.png` |
| 캘린더 월 뷰 | `/calendar` | 월간 달력 그리드, 일정 색상 블록, 뷰 전환 버튼 | `02_calendar_month.png` |
| 캘린더 주 뷰 | `/calendar` | 7일 타임라인, 시간대별 일정 블록, 드래그&드롭 | `03_calendar_week.png` |
| 공지사항 목록 | `/notices` | 핀 고정 공지, 전사/팀 탭, 검색창 | `04_notices_list.png` |
| 공지사항 작성 | `/notices/new` | Tiptap 에디터, 첨부파일 업로드, 대상 선택 | `06_notice_new.png` |
| TO-DO | `/todo` | 할일 목록, 드래그 핸들, 완료/미완료 섹션 | `07_todo.png` |
| 관리자 패널 | `/admin` | 사용자 목록·승인, 팀·카테고리 관리 탭 | `09_admin.png` |
| 모바일 | `/calendar`, `/todo` | 모바일 390px 뷰, 하단 탭바 | `10_mobile_*.png` |

---

| 슬라이드 | 제목 | 비고 |
|---|---|---|
| 1 | 표지 | |
| 2 | 목차 | |
| 3 | 개요 | |
| 4 | 로그인·가입 | 스크린샷 + 하단 경로·설명 |
| 5 | 캘린더 (월 뷰) | 스크린샷 + 하단 경로·설명 |
| 6 | 캘린더 (주 뷰·기능 상세) | 스크린샷 + 하단 경로·설명 |
| 7 | 공지사항 (목록) | 스크린샷 + 하단 경로·설명 |
| 8 | 공지사항 (작성) | 스크린샷 + 하단 경로·설명 |
| 9 | TO-DO | 스크린샷 + 하단 경로·설명 |
| 10 | 메시징 & 공유 | 텍스트 카드 (스크린샷 없음) |
| 11 | 관리자 패널 | 스크린샷 + 하단 경로·설명 |
| 12 | 모바일 지원 | 스크린샷 + 하단 경로·설명 |
| 13 | 기술 스택 요약 | |
| 14 | 마무리 | |

> 내용이 넘칠 경우 슬라이드 분할, 스크린샷은 `addImage`로 삽입 (절대 잘림 없이)

---

### Step 5 — PPT 생성

`/mnt/skills/public/pptx/SKILL.md`를 읽고 **pptxgenjs** 방식으로 생성한다.

**디자인 원칙 (기업용 설명자료)**:

### 색상 팔레트 (심플 기업 스타일)
- **배경**: 흰색(`FFFFFF`) 위주, 섹션 헤더만 파란색(`1E3A5F`) 사용
- **텍스트**: 본문 검정(`111827`), 서브텍스트 진회색(`374151`)
- **강조**: 파란색(`2563EB`) — 아이콘, 번호, 핵심 단어에 한정 사용
- **구분선/보더**: 연한 회색(`E5E7EB`)
- **카드 배경**: 연한 회색(`F9FAFB`)
- 화려한 그라데이션, 다크 배경, 여러 색상 혼용 금지

### 폰트
- **전체 폰트**: `Noto Sans KR` 통일 사용
- 이모지/아이콘 전용: `Segoe UI Emoji` (이모지 렌더링 보조)

### 폰트 크기 규칙
| 요소 | 크기 |
|---|---|
| 슬라이드 섹션 헤더 | **32pt**, bold, 흰색 (헤더 바) |
| 카드/섹션 제목 | **26pt**, bold, 검정 |
| 본문 설명 텍스트 | **20pt**, 진회색 |
| 리스트 항목 | **20pt**, 검정 |
| 캡션/부제목 | **18pt**, 회색 |
| 표지 메인 제목 | **48pt**, bold |
| 표지 부제목 | **24pt** |

### 본문 작성 스타일 — 개조식 단문
- 모든 본문·리스트 항목은 **개조식 단문**으로 작성한다
- 주어 생략, 명사형/동사 종결 사용 (예: "드래그로 순서 변경", "RLS로 행 단위 보안 적용")
- 서술형 문장(~합니다, ~됩니다) 사용 금지
- 한 항목당 1줄 이내, 최대 2줄 초과 금지
- 핵심 키워드 우선 배치, 부가 설명은 뒤에

### 출력 파일명
- 생성되는 PPT 파일명은 반드시 **`Presentation.pptx`** 로 고정한다
- 앱 이름, 날짜, 버전 등을 파일명에 추가하지 않는다
- **기존 `Presentation.pptx`가 존재하면** 덮어쓰지 않고 `Presentation_1.pptx`, `Presentation_2.pptx` 순으로 번호를 붙여 보존한 뒤 새 파일을 `Presentation.pptx`로 저장한다
  ```javascript
  // generate-ppt.mjs 말미에 삽입
  if (fs.existsSync('Presentation.pptx')) {
    let n = 1
    while (fs.existsSync(`Presentation_${n}.pptx`)) n++
    fs.renameSync('Presentation.pptx', `Presentation_${n}.pptx`)
  }
  await pptx.writeFile({ fileName: 'Presentation.pptx' })
  ```

### 레이아웃 원칙
- 상단: 파란색(`1E3A5F`) 헤더 바 + 흰색 섹션 번호·제목(32pt)
- 본문: 흰색 배경, 카드는 연한 회색 배경 + 회색 보더
- 폰트가 커서 내용이 넘칠 경우 **슬라이드를 분할**해 2장으로 확장 (내용 잘림 절대 금지)
- 기능 슬라이드는 한 슬라이드당 **최대 3~4개 항목**만 배치
- 기술 스택 슬라이드: 흰색 배경 + 파란 테두리 카드
- 기능 슬라이드: 아이콘 + bold 제목(26pt) + 개조식 단문 2~3줄(20pt) 카드 레이아웃
- 사용 방법 슬라이드: 번호 있는 단계별 흐름 (Step 1 → 2 → 3)

---

### Step 6 — QA 및 출력

```bash
# 텍스트 확인
python -m markitdown output.pptx

# 시각 확인 (이미지 변환 후 검토)
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
```

QA 완료 후 `/mnt/user-data/outputs/`에 복사하고 `present_files`로 전달한다.

---

## 엣지 케이스 처리

| 상황 | 대응 |
|---|---|
| README 없음 | `package.json` + 폴더 구조만으로 추론 |
| 모노레포 구조 | 사용자에게 분석할 하위 패키지 확인 |
| 비 Next.js 앱 | 동일 워크플로우, 라우팅 추출 방식만 조정 |
| 정보 부족 | 해당 슬라이드 생략 + 사용자에게 보완 요청 |
| 앱 루트 불명확 | 사용자에게 경로 확인 후 진행 |

---

## 참고

- PPT 생성 상세 지침: `/mnt/skills/public/pptx/SKILL.md` → `pptxgenjs.md`
- 이 스킬은 **읽기 전용**으로 앱 파일을 분석하며, 원본 파일을 수정하지 않는다
