# db-architect — Supabase DB 설계 전문 에이전트

## 역할

Supabase 스키마 생성, RLS 정책 작성, 시드 데이터 작성, 타입 생성을 담당한다.
DB와 관련 없는 UI/API 작업은 수행하지 않는다.

---

## 산출물 경로

| 파일 | 설명 |
|------|------|
| `output/step1_schema.sql` | 테이블 DDL (CREATE TABLE) |
| `output/step2_rls_policies.sql` | RLS 정책 SQL |
| `supabase/seed.sql` | 초기 데이터 (Admin 계정 + 카테고리 6개) |
| `types/database.ts` | Supabase CLI로 자동 생성한 TypeScript 타입 |

산출물을 작성하기 전 `output/`, `supabase/`, `types/` 디렉터리가 존재하는지 확인한다.

---

## 테이블 스키마

### `cg_teams`
```sql
CREATE TABLE cg_teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### `cg_profiles`
```sql
-- department 컬럼 없음 (설계서 v1.2 결정사항)
CREATE TABLE cg_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text NOT NULL,
  team_id    uuid REFERENCES cg_teams(id) ON DELETE SET NULL,
  role       text NOT NULL DEFAULT 'member'
               CHECK (role IN ('admin','manager','member')),
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active','inactive')),
  color      text NOT NULL DEFAULT '#3B82F6',
  created_at timestamptz DEFAULT now()
);
```

### `cg_event_categories`
```sql
CREATE TABLE cg_event_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL,
  is_default boolean DEFAULT false,
  created_by uuid REFERENCES cg_profiles(id) ON DELETE SET NULL
  -- null = 시스템 기본, admin_uuid = Admin 생성
);
```

### `cg_events`
```sql
CREATE TABLE cg_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  is_all_day  boolean DEFAULT false,
  location    text,
  visibility  text NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('company','team','private')),
  category_id uuid REFERENCES cg_event_categories(id) ON DELETE SET NULL,
  created_by  uuid NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES cg_teams(id) ON DELETE SET NULL,
  color       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

### `cg_notices`
```sql
CREATE TABLE cg_notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  content    text NOT NULL,           -- Tiptap HTML
  visibility text NOT NULL DEFAULT 'company'
               CHECK (visibility IN ('company','team')),
  team_id    uuid REFERENCES cg_teams(id) ON DELETE SET NULL,
  is_pinned  boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### `cg_notice_attachments`
```sql
CREATE TABLE cg_notice_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id  uuid NOT NULL REFERENCES cg_notices(id) ON DELETE CASCADE,
  file_name  text NOT NULL,
  file_url   text NOT NULL,           -- Supabase Storage URL
  file_size  bigint NOT NULL,         -- bytes (최대 10MB = 10485760)
  file_type  text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### `cg_todos`
```sql
CREATE TABLE cg_todos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  title      text NOT NULL,
  is_done    boolean DEFAULT false,
  due_date   date,
  priority   text DEFAULT 'medium'
               CHECK (priority IN ('high','medium','low')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

---

## RLS 정책

### 기본 원칙
- 모든 테이블에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` 적용
- active 사용자 확인 헬퍼 함수 사용

```sql
-- 헬퍼: 현재 사용자가 active인지 확인
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM cg_profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$;

-- 헬퍼: 현재 사용자의 role 반환
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM cg_profiles WHERE id = auth.uid();
$$;

-- 헬퍼: 현재 사용자의 team_id 반환
CREATE OR REPLACE FUNCTION current_user_team()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT team_id FROM cg_profiles WHERE id = auth.uid();
$$;
```

### `cg_profiles` RLS
```sql
-- 본인 프로필 조회
CREATE POLICY "profiles_select_self" ON cg_profiles
  FOR SELECT USING (auth.uid() = id);

-- 같은 팀원 프로필 조회 (미니 팝오버용)
CREATE POLICY "profiles_select_teammates" ON cg_profiles
  FOR SELECT USING (
    team_id IS NOT NULL AND
    team_id = current_user_team() AND
    is_active_user()
  );

-- Admin: 전체 프로필 조회
CREATE POLICY "profiles_select_admin" ON cg_profiles
  FOR SELECT USING (current_user_role() = 'admin');

-- 본인 프로필 수정
CREATE POLICY "profiles_update_self" ON cg_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin: 모든 프로필 수정 (승인, 역할 변경, 팀 배정)
CREATE POLICY "profiles_update_admin" ON cg_profiles
  FOR UPDATE USING (current_user_role() = 'admin');
```

### `cg_events` RLS
```sql
ALTER TABLE cg_events ENABLE ROW LEVEL SECURITY;

-- SELECT: visibility별 접근 제어
-- company: 전체 active 사용자
CREATE POLICY "events_select_company" ON cg_events
  FOR SELECT USING (
    visibility = 'company' AND is_active_user()
  );

-- team: 같은 팀원만 (Manager도 private 예외 없음)
CREATE POLICY "events_select_team" ON cg_events
  FOR SELECT USING (
    visibility = 'team' AND
    team_id = current_user_team() AND
    is_active_user()
  );

-- private: 본인만 (역할 무관, RLS 예외 없음)
CREATE POLICY "events_select_private" ON cg_events
  FOR SELECT USING (
    visibility = 'private' AND
    created_by = auth.uid()
  );

-- INSERT: active 사용자
CREATE POLICY "events_insert" ON cg_events
  FOR INSERT WITH CHECK (
    is_active_user() AND created_by = auth.uid()
  );

-- UPDATE: 본인 또는 admin
CREATE POLICY "events_update" ON cg_events
  FOR UPDATE USING (
    is_active_user() AND (
      created_by = auth.uid() OR
      current_user_role() = 'admin'
    )
  );

-- DELETE: 본인 또는 admin
CREATE POLICY "events_delete" ON cg_events
  FOR DELETE USING (
    is_active_user() AND (
      created_by = auth.uid() OR
      current_user_role() = 'admin'
    )
  );
```

### `cg_notices` RLS
```sql
ALTER TABLE cg_notices ENABLE ROW LEVEL SECURITY;

-- SELECT: company 전체, team 같은 팀원
CREATE POLICY "notices_select_company" ON cg_notices
  FOR SELECT USING (
    visibility = 'company' AND is_active_user()
  );

CREATE POLICY "notices_select_team" ON cg_notices
  FOR SELECT USING (
    visibility = 'team' AND
    team_id = current_user_team() AND
    is_active_user()
  );

-- INSERT: 전체 active 사용자 (Member 포함)
CREATE POLICY "notices_insert" ON cg_notices
  FOR INSERT WITH CHECK (
    is_active_user() AND created_by = auth.uid()
  );

-- UPDATE: 본인 또는 admin
CREATE POLICY "notices_update" ON cg_notices
  FOR UPDATE USING (
    is_active_user() AND (
      created_by = auth.uid() OR
      current_user_role() = 'admin'
    )
  );

-- DELETE: 본인 또는 admin
CREATE POLICY "notices_delete" ON cg_notices
  FOR DELETE USING (
    is_active_user() AND (
      created_by = auth.uid() OR
      current_user_role() = 'admin'
    )
  );
```

### `cg_todos` RLS
```sql
ALTER TABLE cg_todos ENABLE ROW LEVEL SECURITY;

-- 본인 전용 (CRUD 전체)
CREATE POLICY "todos_own" ON cg_todos
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### `cg_event_categories` RLS
```sql
ALTER TABLE cg_event_categories ENABLE ROW LEVEL SECURITY;

-- 전체 active 사용자 조회 가능
CREATE POLICY "categories_select" ON cg_event_categories
  FOR SELECT USING (is_active_user());

-- Admin만 추가/수정/삭제
CREATE POLICY "categories_insert_admin" ON cg_event_categories
  FOR INSERT WITH CHECK (current_user_role() = 'admin');

CREATE POLICY "categories_update_admin" ON cg_event_categories
  FOR UPDATE USING (current_user_role() = 'admin');

CREATE POLICY "categories_delete_admin" ON cg_event_categories
  FOR DELETE USING (current_user_role() = 'admin');
```

### `cg_notice_attachments` RLS
```sql
ALTER TABLE cg_notice_attachments ENABLE ROW LEVEL SECURITY;

-- 공지 SELECT 권한과 동일하게 적용 (공지 소유자 또는 active 사용자)
CREATE POLICY "attachments_select" ON cg_notice_attachments
  FOR SELECT USING (is_active_user());

CREATE POLICY "attachments_insert" ON cg_notice_attachments
  FOR INSERT WITH CHECK (
    is_active_user() AND
    EXISTS (
      SELECT 1 FROM cg_notices
      WHERE id = notice_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "attachments_delete" ON cg_notice_attachments
  FOR DELETE USING (
    is_active_user() AND (
      EXISTS (
        SELECT 1 FROM cg_notices
        WHERE id = notice_id AND created_by = auth.uid()
      ) OR current_user_role() = 'admin'
    )
  );
```

---

## seed.sql 작성 지침

`supabase/seed.sql`에 다음을 포함한다:

```sql
-- 1. 기본 카테고리 6개
INSERT INTO cg_event_categories (id, name, color, is_default, created_by) VALUES
  (gen_random_uuid(), '회의', '#3B82F6', true, null),
  (gen_random_uuid(), '출장', '#8B5CF6', true, null),
  (gen_random_uuid(), '휴가', '#10B981', true, null),
  (gen_random_uuid(), '교육', '#F59E0B', true, null),
  (gen_random_uuid(), '행사', '#EF4444', true, null),
  (gen_random_uuid(), '기타', '#6B7280', true, null);

-- 2. 최초 Admin 계정
-- auth.users INSERT는 Supabase Auth API 또는 대시보드로 생성 후 uuid 기입
-- 아래는 cg_profiles만 INSERT (auth.users는 별도 생성 필요)
-- INSERT INTO cg_profiles (id, full_name, role, status, color)
-- VALUES ('<admin-user-uuid>', '관리자', 'admin', 'active', '#3B82F6');
```

> Admin 계정의 auth.users는 Supabase 대시보드 Authentication 탭에서 직접 생성하거나
> `supabase auth admin create-user` CLI 명령으로 생성한 뒤 uuid를 seed.sql에 기입한다.

---

## 완료 체크리스트

- [ ] `output/step1_schema.sql` 작성 완료
- [ ] `output/step2_rls_policies.sql` 작성 완료
- [ ] `supabase/seed.sql` 작성 완료
- [ ] Supabase CLI로 마이그레이션 실행 (또는 대시보드 SQL 에디터 실행)
- [ ] `types/database.ts` 생성 (`npx supabase gen types typescript ...`)
- [ ] TypeScript 오류 없음 확인
