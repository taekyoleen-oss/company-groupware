# 주요국 공휴일 데이터 & 캘린더 앱 구현 스펙 (2026)

> 대상 국가: 🇺🇸 미국 · 🇯🇵 일본 · 🇬🇧 영국 · 🇸🇬 싱가포르 · 🇭🇰 홍콩
> 기준 연도: **2026년** / 출처: 각국 정부·공식 게시 자료 기반
> 최종 정리일: 2026-06-01

이 문서는 캘린더 앱에 공휴일 기능을 넣을 때 **그대로 옮겨 쓸 수 있는 데이터셋**과,
나라마다 다른 **대체휴일·지역 분할·음력 처리 규칙**을 명세로 정리한 것입니다.

---

## 0. 가장 먼저 읽어야 할 5가지 설계 원칙

이 5가지를 데이터 모델에 반영하지 않으면 다른 해로 확장할 때 반드시 버그가 납니다.

1. **고정형 vs 계산형을 분리한다.**
   미국·일본 대부분은 "고정일" 또는 "N번째 요일" 규칙이라 코드로 영구 생성 가능.
   설날·Vesak·Deepavali·Hari Raya·부활절(Easter) 계열은 음력/이슬람력/교회력 기반이라
   **연도별로 새 데이터가 필요**하다. → `type` 필드로 구분.

2. **대체휴일 규칙이 나라마다 전부 다르다.** 한 함수로 통일하면 안 된다.
   | 국가 | 규칙 |
   |---|---|
   | 미국 | 토 → 직전 금 / 일 → 다음 월 |
   | 일본 | 일 → 다음 월(振替休日) + 공휴일 사이 평일 = 국민의 휴일(샌드위치) |
   | 싱가포르 | **일 → 월만**. 토요일은 무보상 |
   | 홍콩 | 일 → "다음 비공휴일 평일"까지 캐스케이딩(연쇄) |
   | 영국 | 주말 → 대체일 + **지역별 상이** |

3. **영국은 단일 `country: "UK"`로 모델링하면 안 된다.**
   잉글랜드·웨일스 / 스코틀랜드 / 북아일랜드 3분할 필수. (2026년 각각 8 / 10 / 10일)
   → `region` 필드 필수.

4. **달 관측 기반 공휴일은 잠정(tentative)이다.**
   싱가포르 Hari Raya Puasa·Haji 등은 공식 확정 전까지 변동 가능.
   → `tentative: true` 플래그로 표기하고, 확정 시 갱신 가능한 구조로.

5. **장기적으로는 하드코딩하지 말고 데이터 소스를 연결한다.**
   2026 데이터는 아래에 박혀 있지만, 매년 수작업 갱신을 피하려면
   `date-holidays` npm 라이브러리 사용을 권장(§7 참고).

---

## 1. 권장 데이터 모델 (TypeScript)

```ts
export type HolidayType =
  | "fixed"      // 매년 같은 양력 날짜 (예: 미국 7/4, 일본 11/3)
  | "weekday"    // N번째 요일 규칙 (예: 미국 MLK 1월 셋째 월)
  | "lunar"      // 음력 기반 (예: 설날, 중추절, Vesak, Deepavali)
  | "islamic"    // 이슬람력 기반 (예: Hari Raya)
  | "easter";    // 부활절 연동 (예: Good Friday, Easter Monday)

export type Region =
  | "US" | "JP" | "SG" | "HK"
  | "UK-EAW"   // England & Wales
  | "UK-SCT"   // Scotland
  | "UK-NIR";  // Northern Ireland

export interface Holiday {
  region: Region;
  name: string;            // 영문/표준 명칭
  localName?: string;      // 현지어 명칭 (선택)
  date: string;            // 실제 쉬는 날 (ISO, 대체 적용 후) — 캘린더에 마킹할 날
  actualDate?: string;     // 명목상 날짜 (대체로 인해 date와 다를 때만)
  type: HolidayType;
  substitute?: boolean;    // 대체/관찰 휴일 여부
  tentative?: boolean;     // 미확정(달 관측 등) 여부
  note?: string;
}
```

> **핵심:** `date`는 "실제로 쉬는 날(대체 적용 후)", `actualDate`는 "명목상 날짜".
> 미국 독립기념일처럼 명목일(7/4 토)과 휴무일(7/3 금)이 다를 때 둘 다 보관해야
> 앱에서 "Independence Day (observed)"처럼 정확히 표시할 수 있습니다.

---

## 2. 🇺🇸 미국 — 연방 공휴일 11개

대체 규칙: **토 → 직전 금 / 일 → 다음 월**

| 명칭 | 명목일 | 실제 휴무일 | 비고 |
|---|---|---|---|
| New Year's Day | 1/1 (목) | 1/1 | |
| Martin Luther King Jr. Day | 1/19 (월) | 1/19 | 1월 셋째 월 |
| Presidents' Day | 2/16 (월) | 2/16 | 2월 셋째 월 |
| Memorial Day | 5/25 (월) | 5/25 | 5월 마지막 월 |
| Juneteenth | 6/19 (금) | 6/19 | |
| Independence Day | 7/4 (토) | **7/3 (금)** | 토요일 → 금 대체 |
| Labor Day | 9/7 (월) | 9/7 | 9월 첫째 월 |
| Columbus Day | 10/12 (월) | 10/12 | 10월 둘째 월 |
| Veterans Day | 11/11 (수) | 11/11 | |
| Thanksgiving | 11/26 (목) | 11/26 | 11월 넷째 목 |
| Christmas Day | 12/25 (금) | 12/25 | |

---

## 3. 🇯🇵 일본 — 2026년은 특이하게 17일

대체 규칙: **일 → 다음 월(振替休日)** + **공휴일 사이 평일 = 국민의 휴일(샌드위치)**

| 명칭(현지) | 명목일 | 실제 휴무일 | 비고 |
|---|---|---|---|
| 元日 | 1/1 | 1/1 | |
| 成人の日 | 1/12 | 1/12 | 1월 둘째 월 |
| 建国記念の日 | 2/11 | 2/11 | |
| 天皇誕生日 | 2/23 | 2/23 | |
| 春分の日 | 3/20 | 3/20 | 매년 계산 변동 |
| 昭和の日 | 4/29 | 4/29 | |
| 憲法記念日 | 5/3 (일) | **5/6 (수)** | 일요일 → 5/6 대체* |
| みどりの日 | 5/4 | 5/4 | |
| こどもの日 | 5/5 | 5/5 | |
| 海の日 | 7/20 | 7/20 | 7월 셋째 월 |
| 山の日 | 8/11 | 8/11 | |
| 敬老の日 | 9/21 | 9/21 | 9월 셋째 월 |
| **国民の休日** | 9/22 | 9/22 | **샌드위치 휴일(실버위크)** |
| 秋分の日 | 9/23 | 9/23 | 매년 계산 변동 |
| スポーツの日 | 10/12 | 10/12 | 10월 둘째 월 |
| 文化の日 | 11/3 | 11/3 | |
| 勤労感謝の日 | 11/23 | 11/23 | |

> *憲法記念日(5/3 일)의 대체일이 통상 월요일(5/4)이지만 5/4·5/5가 이미 공휴일이라
> 다음 비공휴일인 **5/6(수)**로 밀립니다. 9/22는 敬老の日(9/21)과 秋分の日(9/23)
> 사이에 끼어 자동 공휴일이 되며 9/19~23 5일 연휴(실버위크)를 만듭니다.
> 두 규칙 모두 **연도별로 달라지므로** 일본 데이터는 매년 재생성 권장.

---

## 4. 🇬🇧 영국 — 지역 3분할 필수 ⚠️

영국은 단일 공휴일 캘린더가 없습니다. 반드시 region을 나눠 저장하세요.
6개는 전 지역 공통(New Year, Good Friday, Early May, Spring, Christmas, Boxing 대체),
나머지는 지역별로 다릅니다.

### 4-1. 잉글랜드·웨일스 (`UK-EAW`, 8일)
| 명칭 | 명목일 | 실제 휴무일 |
|---|---|---|
| New Year's Day | 1/1 (목) | 1/1 |
| Good Friday | 4/3 (금) | 4/3 |
| Easter Monday | 4/6 (월) | 4/6 |
| Early May Bank Holiday | 5/4 (월) | 5/4 |
| Spring Bank Holiday | 5/25 (월) | 5/25 |
| Summer Bank Holiday | 8/31 (월) | 8/31 |
| Christmas Day | 12/25 (금) | 12/25 |
| Boxing Day | 12/26 (토) | **12/28 (월)** 대체 |

### 4-2. 스코틀랜드 (`UK-SCT`, 2026년 10일)
| 명칭 | 명목일 | 실제 휴무일 |
|---|---|---|
| New Year's Day | 1/1 (목) | 1/1 |
| 2nd January | 1/2 (금) | 1/2 |
| Good Friday | 4/3 (금) | 4/3 |
| Early May Bank Holiday | 5/4 (월) | 5/4 |
| Spring Bank Holiday | 5/25 (월) | 5/25 |
| **World Cup 기념(일회성)** | 6/15 (월) | 6/15 |
| Summer Bank Holiday | **8/3 (월)** | 8/3 |
| St Andrew's Day | 11/30 (월) | 11/30 |
| Christmas Day | 12/25 (금) | 12/25 |
| Boxing Day | 12/26 (토) | **12/28 (월)** 대체 |

> 스코틀랜드 특이점: **Easter Monday 없음**, Summer BH가 8/3(8/31 아님),
> 2026 한정 6/15 월드컵 일회성 공휴일(일부 지자체 미참여 → 앱에 note 권장).

### 4-3. 북아일랜드 (`UK-NIR`, 10일)
| 명칭 | 명목일 | 실제 휴무일 |
|---|---|---|
| New Year's Day | 1/1 (목) | 1/1 |
| St Patrick's Day | 3/17 (화) | 3/17 |
| Good Friday | 4/3 (금) | 4/3 |
| Easter Monday | 4/6 (월) | 4/6 |
| Early May Bank Holiday | 5/4 (월) | 5/4 |
| Spring Bank Holiday | 5/25 (월) | 5/25 |
| Battle of the Boyne | 7/12 (일) | **7/13 (월)** 대체 |
| Summer Bank Holiday | 8/31 (월) | 8/31 |
| Christmas Day | 12/25 (금) | 12/25 |
| Boxing Day | 12/26 (토) | **12/28 (월)** 대체 |

---

## 5. 🇸🇬 싱가포르 — 공식 11일

대체 규칙: **일 → 다음 월만** (토요일은 무보상!)

| 명칭 | 명목일 | 실제 휴무일 | 비고 |
|---|---|---|---|
| New Year's Day | 1/1 (목) | 1/1 | |
| Chinese New Year (1일차) | 2/17 (화) | 2/17 | 음력 |
| Chinese New Year (2일차) | 2/18 (수) | 2/18 | 음력 |
| Hari Raya Puasa | 3/21 (토) | 3/21 | **잠정**, 토요일이라 대체 없음 |
| Good Friday | 4/3 (금) | 4/3 | |
| Labour Day | 5/1 (금) | 5/1 | |
| Hari Raya Haji | 5/27 (수) | 5/27 | **잠정** |
| Vesak Day | 5/31 (일) | **6/1 (월)** | 음력, 일 → 월 대체 |
| National Day | 8/9 (일) | **8/10 (월)** | 일 → 월 대체 |
| Deepavali | 11/8 (일) | **11/9 (월)** | 음력, 일 → 월 대체 |
| Christmas Day | 12/25 (금) | 12/25 | |

> ⚠️ Hari Raya Puasa(3/21)는 **토요일이라 대체휴일 없음** — 미국/영국과 규칙이 다릅니다.
> Hari Raya 날짜(3/21, 5/27)는 달 관측 기반 **잠정값** → `tentative: true`로 표기.

---

## 6. 🇭🇰 홍콩 — 일반 공휴일(General Holidays) 17일

대체 규칙: **일 → "다음 비공휴일 평일"까지 캐스케이딩**

| 명칭 | 실제 휴무일 | 비고 |
|---|---|---|
| New Year's Day | 1/1 (목) | |
| Lunar New Year (1일차) | 2/17 (화) | 음력 |
| Lunar New Year (2일차) | 2/18 (수) | 음력 |
| Lunar New Year (3일차) | 2/19 (목) | 음력 |
| Good Friday | 4/3 (금) | |
| Day following Good Friday | 4/4 (토) | |
| Ching Ming 대체 | 4/6 (월) | 청명절(4/5 일) → 대체 |
| Easter Monday 다음 추가 | 4/7 (화) | **캐스케이딩 연쇄 대체** |
| Labour Day | 5/1 (금) | |
| Buddha's Birthday 대체 | 5/25 (월) | 석탄일(5/24 일) → 대체 |
| Tuen Ng (단오) | 6/19 (금) | 음력 |
| HKSAR Establishment Day | 7/1 (수) | |
| Mid-Autumn 다음날 | 9/26 (토) | 중추절(9/25) 익일 |
| National Day | 10/1 (목) | |
| Chung Yeung 대체 | 10/19 (월) | 중양절(10/18 일) → 대체 |
| Christmas Day | 12/25 (금) | |
| First weekday after Christmas | 12/26 (토) | |

> 홍콩 캐스케이딩 예시: 청명절(4/5 일) → 대체일 4/6(월)인데 그날이 Easter Monday라
> 다시 다음 비공휴일 평일 **4/7(화)**가 추가 지정됩니다.
> 홍콩 데이터는 음력 + 캐스케이딩 때문에 가장 까다로우므로 **수동 검증 또는 라이브러리** 권장.

---

## 7. 권장 구현 방식 — `date-holidays`

매년 수작업 갱신을 피하려면 npm 라이브러리 사용을 권장합니다.
음력/이슬람력 계산, 대체휴일, 영국 지역 분할을 모두 내장합니다.

```bash
npm install date-holidays
```

```ts
import Holidays from "date-holidays";

// 국가/지역별 인스턴스
const regions = {
  US: new Holidays("US"),
  JP: new Holidays("JP"),
  SG: new Holidays("SG"),
  HK: new Holidays("HK"),
  "UK-EAW": new Holidays("GB", "ENG"), // England (Wales는 "WLS")
  "UK-SCT": new Holidays("GB", "SCT"), // Scotland
  "UK-NIR": new Holidays("GB", "NIR"), // Northern Ireland
};

function getHolidays(regionKey: keyof typeof regions, year = 2026) {
  return regions[regionKey].getHolidays(year);
  // → [{ date, start, end, name, type }, ...]
}
```

> **주의:** 라이브러리 값도 음력/이슬람력 공휴일은 잠정일 수 있으므로,
> production에서는 각국 공식 데이터(싱가포르 data.gov.sg, 홍콩 정부 gazette,
> 미국 OPM, 영국 GOV.UK, 일본 내각부)와 **연 1회 교차 검증**을 권장합니다.

---

## 8. 바로 쓸 수 있는 2026 데이터셋 (TypeScript)

§1 모델에 맞춘 평면 배열입니다. 그대로 `holidays-2026.ts`로 저장해 import 하세요.

```ts
import type { Holiday } from "./types";

export const HOLIDAYS_2026: Holiday[] = [
  // 🇺🇸 USA
  { region: "US", name: "New Year's Day", date: "2026-01-01", type: "fixed" },
  { region: "US", name: "Martin Luther King Jr. Day", date: "2026-01-19", type: "weekday" },
  { region: "US", name: "Presidents' Day", date: "2026-02-16", type: "weekday" },
  { region: "US", name: "Memorial Day", date: "2026-05-25", type: "weekday" },
  { region: "US", name: "Juneteenth", date: "2026-06-19", type: "fixed" },
  { region: "US", name: "Independence Day", date: "2026-07-03", actualDate: "2026-07-04", type: "fixed", substitute: true, note: "토요일 → 금요일 대체" },
  { region: "US", name: "Labor Day", date: "2026-09-07", type: "weekday" },
  { region: "US", name: "Columbus Day", date: "2026-10-12", type: "weekday" },
  { region: "US", name: "Veterans Day", date: "2026-11-11", type: "fixed" },
  { region: "US", name: "Thanksgiving", date: "2026-11-26", type: "weekday" },
  { region: "US", name: "Christmas Day", date: "2026-12-25", type: "fixed" },

  // 🇯🇵 Japan
  { region: "JP", name: "New Year's Day", localName: "元日", date: "2026-01-01", type: "fixed" },
  { region: "JP", name: "Coming of Age Day", localName: "成人の日", date: "2026-01-12", type: "weekday" },
  { region: "JP", name: "National Foundation Day", localName: "建国記念の日", date: "2026-02-11", type: "fixed" },
  { region: "JP", name: "Emperor's Birthday", localName: "天皇誕生日", date: "2026-02-23", type: "fixed" },
  { region: "JP", name: "Vernal Equinox Day", localName: "春分の日", date: "2026-03-20", type: "fixed", note: "매년 계산 변동" },
  { region: "JP", name: "Showa Day", localName: "昭和の日", date: "2026-04-29", type: "fixed" },
  { region: "JP", name: "Constitution Memorial Day", localName: "憲法記念日", date: "2026-05-06", actualDate: "2026-05-03", type: "fixed", substitute: true, note: "일요일 → 5/6 대체(5/4·5/5가 이미 공휴일)" },
  { region: "JP", name: "Greenery Day", localName: "みどりの日", date: "2026-05-04", type: "fixed" },
  { region: "JP", name: "Children's Day", localName: "こどもの日", date: "2026-05-05", type: "fixed" },
  { region: "JP", name: "Marine Day", localName: "海の日", date: "2026-07-20", type: "weekday" },
  { region: "JP", name: "Mountain Day", localName: "山の日", date: "2026-08-11", type: "fixed" },
  { region: "JP", name: "Respect for the Aged Day", localName: "敬老の日", date: "2026-09-21", type: "weekday" },
  { region: "JP", name: "Citizens' Holiday", localName: "国民の休日", date: "2026-09-22", type: "fixed", note: "샌드위치 휴일(실버위크)" },
  { region: "JP", name: "Autumnal Equinox Day", localName: "秋分の日", date: "2026-09-23", type: "fixed", note: "매년 계산 변동" },
  { region: "JP", name: "Sports Day", localName: "スポーツの日", date: "2026-10-12", type: "weekday" },
  { region: "JP", name: "Culture Day", localName: "文化の日", date: "2026-11-03", type: "fixed" },
  { region: "JP", name: "Labor Thanksgiving Day", localName: "勤労感謝の日", date: "2026-11-23", type: "fixed" },

  // 🇬🇧 UK — England & Wales
  { region: "UK-EAW", name: "New Year's Day", date: "2026-01-01", type: "fixed" },
  { region: "UK-EAW", name: "Good Friday", date: "2026-04-03", type: "easter" },
  { region: "UK-EAW", name: "Easter Monday", date: "2026-04-06", type: "easter" },
  { region: "UK-EAW", name: "Early May Bank Holiday", date: "2026-05-04", type: "weekday" },
  { region: "UK-EAW", name: "Spring Bank Holiday", date: "2026-05-25", type: "weekday" },
  { region: "UK-EAW", name: "Summer Bank Holiday", date: "2026-08-31", type: "weekday" },
  { region: "UK-EAW", name: "Christmas Day", date: "2026-12-25", type: "fixed" },
  { region: "UK-EAW", name: "Boxing Day", date: "2026-12-28", actualDate: "2026-12-26", type: "fixed", substitute: true, note: "토요일 → 월요일 대체" },

  // 🇬🇧 UK — Scotland
  { region: "UK-SCT", name: "New Year's Day", date: "2026-01-01", type: "fixed" },
  { region: "UK-SCT", name: "2nd January", date: "2026-01-02", type: "fixed" },
  { region: "UK-SCT", name: "Good Friday", date: "2026-04-03", type: "easter" },
  { region: "UK-SCT", name: "Early May Bank Holiday", date: "2026-05-04", type: "weekday" },
  { region: "UK-SCT", name: "Spring Bank Holiday", date: "2026-05-25", type: "weekday" },
  { region: "UK-SCT", name: "World Cup Holiday (one-off)", date: "2026-06-15", type: "fixed", note: "2026 한정, 일부 지자체 미참여" },
  { region: "UK-SCT", name: "Summer Bank Holiday", date: "2026-08-03", type: "weekday", note: "잉글랜드와 날짜 다름" },
  { region: "UK-SCT", name: "St Andrew's Day", date: "2026-11-30", type: "fixed" },
  { region: "UK-SCT", name: "Christmas Day", date: "2026-12-25", type: "fixed" },
  { region: "UK-SCT", name: "Boxing Day", date: "2026-12-28", actualDate: "2026-12-26", type: "fixed", substitute: true },

  // 🇬🇧 UK — Northern Ireland
  { region: "UK-NIR", name: "New Year's Day", date: "2026-01-01", type: "fixed" },
  { region: "UK-NIR", name: "St Patrick's Day", date: "2026-03-17", type: "fixed" },
  { region: "UK-NIR", name: "Good Friday", date: "2026-04-03", type: "easter" },
  { region: "UK-NIR", name: "Easter Monday", date: "2026-04-06", type: "easter" },
  { region: "UK-NIR", name: "Early May Bank Holiday", date: "2026-05-04", type: "weekday" },
  { region: "UK-NIR", name: "Spring Bank Holiday", date: "2026-05-25", type: "weekday" },
  { region: "UK-NIR", name: "Battle of the Boyne", date: "2026-07-13", actualDate: "2026-07-12", type: "fixed", substitute: true, note: "일요일 → 월요일 대체" },
  { region: "UK-NIR", name: "Summer Bank Holiday", date: "2026-08-31", type: "weekday" },
  { region: "UK-NIR", name: "Christmas Day", date: "2026-12-25", type: "fixed" },
  { region: "UK-NIR", name: "Boxing Day", date: "2026-12-28", actualDate: "2026-12-26", type: "fixed", substitute: true },

  // 🇸🇬 Singapore
  { region: "SG", name: "New Year's Day", date: "2026-01-01", type: "fixed" },
  { region: "SG", name: "Chinese New Year (Day 1)", date: "2026-02-17", type: "lunar" },
  { region: "SG", name: "Chinese New Year (Day 2)", date: "2026-02-18", type: "lunar" },
  { region: "SG", name: "Hari Raya Puasa", date: "2026-03-21", type: "islamic", tentative: true, note: "토요일이라 대체 없음" },
  { region: "SG", name: "Good Friday", date: "2026-04-03", type: "easter" },
  { region: "SG", name: "Labour Day", date: "2026-05-01", type: "fixed" },
  { region: "SG", name: "Hari Raya Haji", date: "2026-05-27", type: "islamic", tentative: true },
  { region: "SG", name: "Vesak Day", date: "2026-06-01", actualDate: "2026-05-31", type: "lunar", substitute: true, note: "일요일 → 월요일 대체" },
  { region: "SG", name: "National Day", date: "2026-08-10", actualDate: "2026-08-09", type: "fixed", substitute: true, note: "일요일 → 월요일 대체" },
  { region: "SG", name: "Deepavali", date: "2026-11-09", actualDate: "2026-11-08", type: "lunar", substitute: true, note: "일요일 → 월요일 대체" },
  { region: "SG", name: "Christmas Day", date: "2026-12-25", type: "fixed" },

  // 🇭🇰 Hong Kong
  { region: "HK", name: "New Year's Day", date: "2026-01-01", type: "fixed" },
  { region: "HK", name: "Lunar New Year (Day 1)", date: "2026-02-17", type: "lunar" },
  { region: "HK", name: "Lunar New Year (Day 2)", date: "2026-02-18", type: "lunar" },
  { region: "HK", name: "Lunar New Year (Day 3)", date: "2026-02-19", type: "lunar" },
  { region: "HK", name: "Good Friday", date: "2026-04-03", type: "easter" },
  { region: "HK", name: "Day following Good Friday", date: "2026-04-04", type: "easter" },
  { region: "HK", name: "Day following Ching Ming Festival", date: "2026-04-06", type: "lunar", substitute: true, note: "청명절(4/5 일) 대체" },
  { region: "HK", name: "Day following Easter Monday", date: "2026-04-07", type: "easter", substitute: true, note: "캐스케이딩 추가 대체" },
  { region: "HK", name: "Labour Day", date: "2026-05-01", type: "fixed" },
  { region: "HK", name: "Day following Buddha's Birthday", date: "2026-05-25", type: "lunar", substitute: true, note: "석탄일(5/24 일) 대체" },
  { region: "HK", name: "Tuen Ng Festival", date: "2026-06-19", type: "lunar" },
  { region: "HK", name: "HKSAR Establishment Day", date: "2026-07-01", type: "fixed" },
  { region: "HK", name: "Day following Mid-Autumn Festival", date: "2026-09-26", type: "lunar" },
  { region: "HK", name: "National Day", date: "2026-10-01", type: "fixed" },
  { region: "HK", name: "Day following Chung Yeung Festival", date: "2026-10-19", type: "lunar", substitute: true, note: "중양절(10/18 일) 대체" },
  { region: "HK", name: "Christmas Day", date: "2026-12-25", type: "fixed" },
  { region: "HK", name: "First weekday after Christmas Day", date: "2026-12-26", type: "fixed" },
];
```

---

## 9. 갱신 체크리스트 (매년 / 출시 전)

- [ ] 음력·이슬람력 공휴일(설날·중추절·Vesak·Deepavali·Hari Raya) 연도별 재계산
- [ ] 부활절 연동 공휴일(Good Friday·Easter Monday) 재계산
- [ ] 각국 대체휴일 로직 재적용(특히 일본 샌드위치, 홍콩 캐스케이딩)
- [ ] 영국 지역 3분할 유지 + 일회성 공휴일(예: 2026 스코틀랜드 6/15) 확인
- [ ] 싱가포르 Hari Raya `tentative` → 공식 확정 후 플래그 해제
- [ ] 공식 소스 교차 검증(OPM / 내각부 / GOV.UK / data.gov.sg / HK gazette)
