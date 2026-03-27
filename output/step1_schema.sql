-- Company Groupware Schema v1.2
-- Table prefix: cg_

CREATE TABLE IF NOT EXISTS cg_teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- NO department column (v1.2 decision)
CREATE TABLE IF NOT EXISTS cg_profiles (
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

CREATE TABLE IF NOT EXISTS cg_event_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL,
  is_default boolean DEFAULT false,
  created_by uuid REFERENCES cg_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cg_events (
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

CREATE TABLE IF NOT EXISTS cg_notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  content    text NOT NULL,
  visibility text NOT NULL DEFAULT 'company'
               CHECK (visibility IN ('company','team')),
  team_id    uuid REFERENCES cg_teams(id) ON DELETE SET NULL,
  is_pinned  boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES cg_profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cg_notice_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id  uuid NOT NULL REFERENCES cg_notices(id) ON DELETE CASCADE,
  file_name  text NOT NULL,
  file_url   text NOT NULL,
  file_size  bigint NOT NULL,
  file_type  text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cg_todos (
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
