# 기존 일정 → 휴가 전환 기능 설계

- 작성일: 2026-07-12
- 상태: 승인됨(구현 진행)

## 배경 / 문제

현재 "휴가로 전환" 버튼은 **새 일정 작성 화면(EventModal, `!eventId`)에만** 노출된다.
이미 일반 일정(`cg_events.is_vacation=false`)으로 저장된 항목은 휴가로 바꿀 수단이 없다.

요구사항:
- **휴가 대리 게시자(유연재)** 는 타인이 일반 일정으로 잘못 입력한 항목을 휴가로 전환할 수 있어야 한다.
- **작성자 본인** 도 자신의 일반 일정을 휴가로 전환할 수 있어야 한다.

## 결정 사항 (사용자 확인)

1. **결재 처리**: 일반 휴가 신청과 동일한 결재 흐름을 따른다.
   - 작성자 본인 전환: 자기결재 대상(결재자 역할 + 외부 결재자 미지정)이면 즉시 확정, 아니면 결재 대기.
   - 대리 게시자가 타인 일정 전환: 대상자 명의로 대리 신청 → 대상자의 결재자(미지정 시 앱관리자)에게 결재 요청.
2. **원본 일정 처리**: 전환(휴가 신청 접수) 성공 즉시 원본 일반 일정을 삭제한다.
   - 결재가 거부되어도 원본 일정은 복구하지 않는다("일정→휴가로 변경" 직관과 일치, 구현 단순).

## 접근 방식

기존 자산을 재사용한다. **백엔드 변경 없음.**
- 휴가 생성: 기존 `POST /api/vacation/request` (본인/대리 결재 분기, 잔여일수·중복·알림 처리 내장).
- 원본 삭제: 기존 `DELETE /api/events/[id]` (소유자·앱관리자·대리 게시자 허용).

프런트엔드 3개 파일만 수정한다.

## 컴포넌트별 변경

### 1) `components/calendar/EventModal.tsx`
- 전환 버튼 노출 조건을 확장: 신규(`!eventId`)뿐 아니라
  **기존 일정이면서 (작성자 본인 `createdBy === currentUserId` || 대리 게시자 `isProxyEditor`)** 일 때도 노출.
- `onConvertToVacation` 콜백 payload에 전환 컨텍스트 추가:
  - `fromEventId`: 원본 이벤트 id (신규 전환 시 `undefined`).
  - `targetUserId`: 대리 게시자가 **타인** 일정을 전환할 때만 원본 `created_by`. 본인 전환/신규는 `undefined`.
  - `targetName`: 위 경우의 작성자 이름(표시용).

### 2) `app/(app)/calendar/page.tsx`
- `handleConvertToVacation(data)` 가 전환 컨텍스트를 받아 새 상태 `vacationConvertContext` 에 저장하고
  VacationModal 에 prop 으로 전달. (전환 컨텍스트 없으면 기존 신규 전환과 동일 동작)
- 모달 닫힘/히스토리 정리 시 `vacationConvertContext` 도 초기화.

### 3) `components/calendar/VacationModal.tsx`
- 새 prop `convertContext?: { fromEventId: string; targetUserId?: string; targetName?: string } | null`.
- 전환 모드일 때:
  - `targetUserId` 가 있으면(대리 전환) 대상자를 **고정 표시**(자유 선택 드롭다운 대신 고정 이름).
    `activeName` 계산에 `convertContext.targetName` 을 반영.
  - 상단에 "일정을 휴가로 전환" 안내 배지 표시.
- 신청 성공(`executeSave`의 신규 신청 경로) 후 `convertContext.fromEventId` 가 있으면
  `DELETE /api/events/{fromEventId}` 호출 → 성공 시 `onSuccess()` → 닫기.
  - 원본 삭제 실패 시: 휴가는 이미 접수되었으므로 경고 토스트로 안내(수동 정리 유도).

## 엣지 케이스

- **대상자가 앱관리자**: `/api/vacation/request` 대리 경로가 앱관리자를 대상으로 한 대리 신청을 거부(400).
  현 대리 시스템의 기존 제약. 명확한 에러 토스트로 노출한다(별도 사전 차단은 v1 범위 밖).
- **중복 휴가**: 전환하려는 기간에 대상자의 확정/대기 휴가가 있으면 `/api/vacation/request` 가 400 반환 → 토스트.
- **원본이 이미 휴가**: EventModal 은 일반 일정 전용(휴가는 VacationModal 로 라우팅)이라 발생하지 않음.

## 검증

- `npx tsc --noEmit` 무오류.
- 브라우저(유연재 로그인):
  - 타인(일반 회원) 일반 일정 → 전환 → 대상자 결재자에게 결재 요청 + 원본 일정 삭제 확인.
  - 본인 일반 일정 → 전환 → 결재 흐름 + 원본 삭제 확인.
