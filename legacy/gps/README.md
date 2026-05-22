# GPS 출근 체크 — Legacy 보관

> 2026-05-22 사무실 IP 기반 출근 체크 단일화 결정에 따라 GPS 출근 기능을 UI 에서 제거하고 이 폴더에 코드 스냅샷을 보관합니다.

## 보관 이유

- 현장에서 IP 방식만 사용하기로 결정됨
- 추후 외근 직원 / 다중 사업장 운영 시 GPS 출근을 재도입할 가능성이 있어 코드를 폐기하지 않고 보존

## 제거된 항목

| 위치 | 내용 |
|---|---|
| `app/(app)/profile/page.tsx` | GPS 상태(`gpsStatus`) state, `checkGps()`, GPS 화면(`gpsStatus === 'no_setting'/'checking'/'error'/'idle'/'near'/'far'`) |
| `app/admin/page.tsx` | GPS 회사 위치 카드(`attendance_method === 'gps'` 분기), `useCurrentGPS()`, 출근 체크 방식 토글 |
| `app/api/admin/settings/route.ts` | `attendance_method` 의 기본값 `'gps'` → `'ip'` 로 변경 |
| `lib/utils/haversine` (인라인 정의) | `haversineMeters()` (위·경도 거리 계산 함수) |

## DB 잔존 컬럼 (제거하지 않음)

다음 컬럼은 호환 / 향후 복원을 위해 그대로 유지합니다.

- `cg_company_settings.address`
- `cg_company_settings.latitude`
- `cg_company_settings.longitude`
- `cg_company_settings.radius_meters`
- `cg_company_settings.attendance_method` (값은 항상 `'ip'`)
- `cg_attendance.method` (`'gps'` 값이 들어가는 분기는 더 이상 트리거되지 않음)

복원 시점에 새 마이그레이션 없이 위 컬럼만으로 GPS 모드를 다시 켤 수 있도록 설계되어 있습니다.

## 보관 파일

- `profile-gps.snapshot.tsx` — profile 페이지에서 떼어낸 GPS 관련 코드(state, helper, JSX)
- `admin-gps.snapshot.tsx` — admin 페이지에서 떼어낸 GPS 설정 카드와 `useCurrentGPS` 핸들러

## 복원 방법(간단 가이드)

1. `profile-gps.snapshot.tsx`, `admin-gps.snapshot.tsx` 내용을 해당 페이지에 다시 붙여 넣는다.
2. `app/api/admin/settings/route.ts` 의 fallback 값 `attendance_method: 'ip'` 를 `'gps'` 로 되돌리거나 두 모드 토글 UI 를 재활성화한다.
3. 회사 위치(위·경도)·반경을 새로 입력하고 저장한다.
