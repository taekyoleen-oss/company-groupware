# DB 배포 적용 가이드 — 안정성·보안·성능 개선

> 작성일: 2026-07-09
> 대상 커밋: `6a7667b`(보안) · `4fe77e7`(Disk IO) 외 총 5개 (`f47c2f6`~`81ee299`)
> 이 문서는 **코드 배포(푸시)와 함께 DB에 수동 적용해야 하는 작업**을 정리한 체크리스트입니다.

---

## ⚠ 가장 중요한 원칙 — 코드와 DB를 함께 반영

이번 보안 수정은 **코드와 DB가 반드시 짝으로 적용**되어야 합니다.

- **코드만 배포하고 SQL 미실행 시**: 권한 상승·주민번호 노출 등 보안 구멍이 **그대로 남습니다**. (컬럼 REVOKE 가 없으면 브라우저 직결 우회가 여전히 가능)
- **SQL만 실행하고 코드 미배포 시**: 인사기록/관리자 화면 일부 기능이 **깨집니다**. (예: 관리자 인사기록 편집·PC 승인이 구버전 코드에서는 권한 부족으로 실패)

따라서 **①코드 배포 → ②아래 SQL 실행**을 가능한 한 연속으로 진행하세요. 순서상 코드 먼저 올려도(서비스 role 라우트가 준비되어야 하므로) 무방하며, SQL 실행 직후 효력이 발생합니다.

---

## 1) 실행할 SQL (Supabase Dashboard → SQL Editor)

두 파일 모두 **멱등(재실행 안전)** 하게 작성되어 있습니다. 순서대로 붙여넣고 Run 하세요.

### ☐ step28 — 컬럼 단위 권한 회수 (보안, **필수**)
- 파일: `output/step28_column_privileges_security.sql`
- 하는 일:
  - `cg_profiles`: `role/is_super_admin/status/approver_id` 의 UPDATE 권한 회수 → 회원이 스스로 앱관리자로 승격하는 것을 차단. 본인 편집은 `full_name/color/team_id` 만 허용.
  - `cg_hr_records`: `resident_id`(주민번호)·`notes`(인사메모) 의 SELECT 권한 회수 → 브라우저 직접 조회로 평문 유출 차단.
  - `cg_office_devices`: `status` 의 INSERT/UPDATE 권한 회수 → 개인 PC 자가 승인 차단. 출근 시 `last_ip/last_used_at` 갱신만 허용.
- 짝이 되는 코드: `/api/admin/users/[id]`, `/api/admin/vacation/[userId]`, `/api/admin/hr-records/[userId]`, `/api/hr-records`, `/api/attendance/device-register`, `/api/admin/office-devices/[id]` 를 service_role 로 전환 (커밋 `6a7667b`).

### ☐ step29 — 누락 인덱스 보강 (성능, 권장)
- 파일: `output/step29_performance_indexes_v2.sql`
- 하는 일: `cg_vacation_cancel_requests(requested_by/event_id/status)`, `cg_vacation_requests(event_id)`, `cg_notice_attachments(notice_id)`, `cg_profiles(team_id)` 인덱스 추가.
- 효과: 조인/필터 순차 스캔 제거 → Disk IO 절감(경고 대응 보조).

---

## 2) 적용 후 검증 체크리스트

SQL 실행 + 코드 배포 후 아래를 확인하세요.

### 보안 (step28)
- ☐ **일반 회원 계정**으로 로그인 → 개발자도구 콘솔에서 아래 실행 시 **권한 오류로 실패**해야 정상:
  ```js
  const { createClient } = supabase // 앱의 브라우저 클라이언트
  // 아래는 실패(권한 거부)해야 함:
  await supabase.from('cg_profiles').update({ is_super_admin: true }).eq('id', '<본인id>')
  await supabase.from('cg_hr_records').select('resident_id, notes').eq('user_id', '<본인id>')
  await supabase.from('cg_office_devices').update({ status: 'approved' }).eq('user_id', '<본인id>')
  ```
- ☐ **앱관리자 계정**: 관리자 패널에서 회원 권한/상태 변경, 인사기록 편집(주민번호·메모 표시/저장), PC 승인/거절이 **정상 동작**.
- ☐ 본인 프로필 화면: 주민번호가 **마스킹(######)** 으로만 보이고, 인사메모는 **앱관리자에게만** 표시.
- ☐ 직원 PC 등록 요청 → 관리자 승인 흐름 정상. 재택(사무실 IP 외)에서는 등록/출근 불가.

### 성능 (step29)
- ☐ Supabase Dashboard → Database → Indexes 에서 위 인덱스 6개 생성 확인.
- ☐ (배포 후 수일 관찰) Reports → Database 의 Disk IO 그래프가 하락 추세인지 확인.
  - 코드 쪽 개선(유휴 리로드 제거·실시간 필터·재조회 축소)과 합쳐져 효과가 나타납니다.

---

## 3) 롤백 방법 (문제 발생 시)

컬럼 권한을 되돌리려면 SQL Editor 에서:

```sql
-- cg_profiles 전체 UPDATE 권한 원복
GRANT UPDATE ON cg_profiles TO authenticated;
-- cg_hr_records 전체 SELECT 권한 원복
GRANT SELECT ON cg_hr_records TO authenticated;
-- cg_office_devices 전체 INSERT/UPDATE 권한 원복
GRANT INSERT, UPDATE ON cg_office_devices TO authenticated;
NOTIFY pgrst, 'reload schema';
```
> 단, 원복하면 보안 구멍도 함께 되살아나므로, 원복은 **코드 롤백과 함께** 하고 원인 파악 후 재적용하세요. 인덱스(step29)는 롤백 불필요(무해).

---

## 4) 이번 배포와 별개로 남은 DB 후속 작업 (권장)

아래는 이번 게시에 **필수는 아니지만** 정리해두면 좋은 항목입니다.

### ☐ 타입 재생성 (`types/database.ts`)
- 현재 `cg_messages`, `cg_message_hides`, `cg_hr_records` 3개 테이블이 타입에 없어 12개 라우트가 `as any` 로 우회 중.
- **step28/29 를 DB 에 먼저 적용한 뒤** 아래 실행:
  ```bash
  supabase gen types typescript --project-id cwxpftdbwugusjtbikwn > types/database.ts
  ```
- 재생성 후 `npx tsc --noEmit` 확인 → `as any` 를 점진적으로 제거 가능.

### ☐ 마이그레이션 베이스라인 정식화
- 실 DB 는 `output/step1~29` 를 수동 실행해 만들어졌고, `supabase/migrations/` 는 사실상 비어 있어 **저장소만으로 스키마 재현이 불가**합니다.
- 재해 복구·재구축을 위해 단일 베이스라인 생성 권장:
  ```bash
  supabase db pull        # 현재 DB 스키마를 마이그레이션으로 덤프
  git add supabase/migrations && git commit -m "chore(db): 스키마 베이스라인 정식화"
  ```

### ☐ 휴가 결재 정합성 (다음 일괄 처리 예정)
- 이번 범위에서 **제외**한 항목. 별도 작업으로 진행 예정:
  - 승인/취소 결재의 트랜잭션화(RPC) — 동시 승인 시 이중 차감, 이벤트 직접 삭제로 결재 우회 방지.
  - 관리자/사용자 화면 휴가일수 계산식 통일(달력일 vs 영업일).
  - 잔여일수·중복·역순 날짜 검증, 반차 기간 검증.

---

## 부록 — 이번 배포에 포함된 커밋

| 커밋 | 구분 | 요약 |
|------|------|------|
| `f47c2f6` | chore | 작업 전 스냅샷 (일정→휴가 전환) |
| `6a7667b` | **security** | 컬럼 단위 권한 회수 — **step28 SQL 필요** |
| `4fe77e7` | **perf** | Disk IO 개선 — **step29 SQL 권장** |
| `635764d` | fix | 결재 거부 취소·버튼 고착·중복 제출·침묵 실패 |
| `bd26b89` | fix | 공지 핀 중복/검색·다크모드·모바일·타임존 |
| `81ee299` | chore | 죽은 엔드포인트·플래그 제거 |

> 코드는 순수 애플리케이션 변경이므로 SQL 없이 배포해도 빌드/기동은 됩니다.
> 다만 **보안 효력은 step28 실행 시점부터** 발생합니다.
