


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."approve_vacation_cancel"("p_cancel_id" "uuid", "p_reviewer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  c  cg_vacation_cancel_requests%ROWTYPE;
  ev cg_events%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cg_vacation_cancel_requests WHERE id = p_cancel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF c.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED' USING ERRCODE = 'raise_exception';
  END IF;

  -- 삭제 전 이벤트 스냅샷 (이미 사라졌으면 NULL 스냅샷)
  IF c.event_id IS NOT NULL THEN
    SELECT * INTO ev FROM cg_events WHERE id = c.event_id;
  END IF;

  UPDATE cg_vacation_cancel_requests
     SET status           = 'approved',
         reviewed_by      = p_reviewer_id,
         reviewed_at      = now(),
         event_title      = ev.title,
         event_start_at   = ev.start_at,
         event_end_at     = ev.end_at,
         event_is_all_day = ev.is_all_day
   WHERE id = p_cancel_id;

  -- 휴가 이벤트 제거 (SECURITY DEFINER → 아래 RLS 차단과 무관하게 정당 경로로 삭제)
  IF c.event_id IS NOT NULL THEN
    DELETE FROM cg_events WHERE id = c.event_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."approve_vacation_cancel"("p_cancel_id" "uuid", "p_reviewer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_vacation_request"("p_request_id" "uuid", "p_reviewer_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r cg_vacation_requests%ROWTYPE;
  v_event_id uuid;
BEGIN
  -- 신청 행 잠금 → 동시 승인 직렬화
  SELECT * INTO r FROM cg_vacation_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED' USING ERRCODE = 'raise_exception';
  END IF;

  -- 신청자 명의로 휴가 이벤트 생성 (SECURITY DEFINER → RLS 우회)
  INSERT INTO cg_events (
    title, description, start_at, end_at, is_all_day,
    is_vacation, visibility, color, category_id, created_by, team_id
  )
  VALUES (
    r.title, r.description, r.start_at, r.end_at, r.is_all_day,
    true, 'company', '#F97316', NULL, r.requested_by, NULL
  )
  RETURNING id INTO v_event_id;

  UPDATE cg_vacation_requests
     SET status      = 'approved',
         event_id    = v_event_id,
         reviewed_by = p_reviewer_id,
         reviewed_at = now()
   WHERE id = p_request_id;

  RETURN v_event_id;
END;
$$;


ALTER FUNCTION "public"."approve_vacation_request"("p_request_id" "uuid", "p_reviewer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM cg_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_team"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT team_id FROM cg_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_team"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  profile_count integer;
  user_color    text;
  palette       text[] := ARRAY[
    '#EF4444', '#F97316', '#EAB308', '#22C55E',
    '#10B981', '#14B8A6', '#3B82F6', '#6366F1',
    '#8B5CF6', '#EC4899', '#F43F5E', '#64748B'
  ];
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.cg_profiles;
  user_color := palette[(profile_count % 12) + 1];

  INSERT INTO public.cg_profiles (id, full_name, color, role, status, is_super_admin, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '사용자'),
    user_color,
    CASE WHEN profile_count = 0 THEN 'admin' ELSE 'member' END,
    CASE WHEN profile_count = 0 THEN 'active'  ELSE 'pending' END,
    CASE WHEN profile_count = 0 THEN true      ELSE false    END,
    NEW.email
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND status = 'active');
$$;


ALTER FUNCTION "public"."is_active_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_current_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM cg_profiles WHERE id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_current_super_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cg_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "checked_in_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "method" "text" DEFAULT 'office_login'::"text" NOT NULL,
    "checked_out_at" timestamp with time zone,
    CONSTRAINT "cg_attendance_method_check" CHECK (("method" = ANY (ARRAY['gps'::"text", 'office_login'::"text"])))
);


ALTER TABLE "public"."cg_attendance" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cg_attendance"."checked_out_at" IS '퇴근 시각. 본인이 사무실 IP 안에서 퇴근 확인을 누르거나, 미입력 상태로 다음날 처음 접속 시 18:00(KST)로 자동 보정된다.';



CREATE TABLE IF NOT EXISTS "public"."cg_company_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "radius_meters" integer DEFAULT 200 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attendance_method" "text" DEFAULT 'gps'::"text" NOT NULL,
    "office_ips" "text",
    "require_device_approval" boolean DEFAULT false NOT NULL,
    "vacation_proxy_user_id" "uuid",
    CONSTRAINT "cg_company_settings_attendance_method_check" CHECK (("attendance_method" = ANY (ARRAY['gps'::"text", 'ip'::"text"])))
);


ALTER TABLE "public"."cg_company_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cg_company_settings"."require_device_approval" IS 'true 면 사무실 IP 매칭 + 관리자 승인된 PC만 출근 체크 허용. false 면 IP 매칭만으로 허용.';



COMMENT ON COLUMN "public"."cg_company_settings"."vacation_proxy_user_id" IS '앱관리자가 지정한 휴가 대리 게시자(전사 1명). NULL이면 대리 게시 기능 비활성.';



CREATE TABLE IF NOT EXISTS "public"."cg_event_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_by" "uuid"
);


ALTER TABLE "public"."cg_event_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "is_all_day" boolean DEFAULT false,
    "location" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "category_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "team_id" "uuid",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_vacation" boolean DEFAULT false NOT NULL,
    CONSTRAINT "cg_events_visibility_check" CHECK (("visibility" = ANY (ARRAY['company'::"text", 'team'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."cg_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_hr_records" (
    "user_id" "uuid" NOT NULL,
    "hire_date" "date",
    "phone" "text",
    "emergency_contact" "text",
    "address" "text",
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "education" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "career" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "certificates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "resident_id" "text",
    "hire_position" "text",
    CONSTRAINT "cg_hr_records_career_chk" CHECK ((("jsonb_typeof"("career") = 'array'::"text") AND ("jsonb_array_length"("career") <= 5))),
    CONSTRAINT "cg_hr_records_certificates_chk" CHECK ((("jsonb_typeof"("certificates") = 'array'::"text") AND ("jsonb_array_length"("certificates") <= 5))),
    CONSTRAINT "cg_hr_records_education_chk" CHECK ((("jsonb_typeof"("education") = 'array'::"text") AND ("jsonb_array_length"("education") <= 3)))
);


ALTER TABLE "public"."cg_hr_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_message_hides" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "hidden_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cg_message_hides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_name" "text" NOT NULL,
    "recipient_id" "uuid",
    "recipient_name" "text",
    "team_id" "uuid",
    "team_name" "text",
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_recipient" CHECK (((("recipient_id" IS NOT NULL) AND ("team_id" IS NULL)) OR (("recipient_id" IS NULL) AND ("team_id" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."cg_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."cg_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_notice_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notice_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "file_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cg_notice_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_notices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "visibility" "text" DEFAULT 'company'::"text" NOT NULL,
    "team_id" "uuid",
    "is_pinned" boolean DEFAULT false,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cg_notices_visibility_check" CHECK (("visibility" = ANY (ARRAY['company'::"text", 'team'::"text"])))
);


ALTER TABLE "public"."cg_notices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_office_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_agent" "text" NOT NULL,
    "last_ip" "text",
    "device_label" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "last_used_at" timestamp with time zone,
    CONSTRAINT "cg_office_devices_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."cg_office_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_office_networks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cidr" "text" NOT NULL,
    "label" "text",
    "last_matched_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cg_office_networks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "team_id" "uuid",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "approver_id" "uuid",
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    CONSTRAINT "cg_profiles_approver_not_self" CHECK ((("approver_id" IS NULL) OR ("approver_id" <> "id"))),
    CONSTRAINT "cg_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'member'::"text"]))),
    CONSTRAINT "cg_profiles_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."cg_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text",
    "sort_order" integer DEFAULT 1000 NOT NULL
);


ALTER TABLE "public"."cg_teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "is_done" boolean DEFAULT false,
    "due_date" "date",
    "priority" "text" DEFAULT 'medium'::"text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cg_todos_priority_check" CHECK (("priority" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))
);


ALTER TABLE "public"."cg_todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_vacation_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "total_days" numeric(5,1) DEFAULT 10.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cg_vacation_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_vacation_cancel_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "requested_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_title" "text",
    "event_start_at" timestamp with time zone,
    "event_end_at" timestamp with time zone,
    "event_is_all_day" boolean,
    CONSTRAINT "cg_vacation_cancel_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."cg_vacation_cancel_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cg_vacation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "approver_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "is_all_day" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "event_id" "uuid",
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "posted_by" "uuid",
    CONSTRAINT "cg_vacation_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."cg_vacation_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cg_vacation_requests"."posted_by" IS '대리 게시자 ID. NULL이면 본인이 직접 신청한 건.';



ALTER TABLE ONLY "public"."cg_attendance"
    ADD CONSTRAINT "cg_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_attendance"
    ADD CONSTRAINT "cg_attendance_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."cg_company_settings"
    ADD CONSTRAINT "cg_company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_event_categories"
    ADD CONSTRAINT "cg_event_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_events"
    ADD CONSTRAINT "cg_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_hr_records"
    ADD CONSTRAINT "cg_hr_records_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."cg_message_hides"
    ADD CONSTRAINT "cg_message_hides_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."cg_messages"
    ADD CONSTRAINT "cg_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_notice_attachments"
    ADD CONSTRAINT "cg_notice_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_notices"
    ADD CONSTRAINT "cg_notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_office_devices"
    ADD CONSTRAINT "cg_office_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_office_devices"
    ADD CONSTRAINT "cg_office_devices_user_id_user_agent_key" UNIQUE ("user_id", "user_agent");



ALTER TABLE ONLY "public"."cg_office_networks"
    ADD CONSTRAINT "cg_office_networks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_profiles"
    ADD CONSTRAINT "cg_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_teams"
    ADD CONSTRAINT "cg_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_todos"
    ADD CONSTRAINT "cg_todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_vacation_allocations"
    ADD CONSTRAINT "cg_vacation_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_vacation_allocations"
    ADD CONSTRAINT "cg_vacation_allocations_user_id_year_key" UNIQUE ("user_id", "year");



ALTER TABLE ONLY "public"."cg_vacation_cancel_requests"
    ADD CONSTRAINT "cg_vacation_cancel_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cg_vacation_requests"
    ADD CONSTRAINT "cg_vacation_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "cg_vacation_cancel_requests_status_created_at_idx" ON "public"."cg_vacation_cancel_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_cg_attendance_date" ON "public"."cg_attendance" USING "btree" ("date");



CREATE INDEX "idx_cg_events_created_by" ON "public"."cg_events" USING "btree" ("created_by");



CREATE INDEX "idx_cg_events_is_vacation_partial" ON "public"."cg_events" USING "btree" ("is_vacation", "start_at") WHERE ("is_vacation" = true);



CREATE INDEX "idx_cg_events_start_at" ON "public"."cg_events" USING "btree" ("start_at");



CREATE INDEX "idx_cg_events_team_id" ON "public"."cg_events" USING "btree" ("team_id");



CREATE INDEX "idx_cg_events_visibility_start_at" ON "public"."cg_events" USING "btree" ("visibility", "start_at");



CREATE INDEX "idx_cg_messages_recipient_created" ON "public"."cg_messages" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "idx_cg_messages_sender_created" ON "public"."cg_messages" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "idx_cg_messages_team_created" ON "public"."cg_messages" USING "btree" ("team_id", "created_at" DESC);



CREATE INDEX "idx_cg_notices_created_by" ON "public"."cg_notices" USING "btree" ("created_by");



CREATE INDEX "idx_cg_notices_pinned_created" ON "public"."cg_notices" USING "btree" ("is_pinned" DESC, "created_at" DESC);



CREATE INDEX "idx_cg_notices_team_id" ON "public"."cg_notices" USING "btree" ("team_id");



CREATE INDEX "idx_cg_notices_visibility" ON "public"."cg_notices" USING "btree" ("visibility");



CREATE INDEX "idx_cg_profiles_approver_id" ON "public"."cg_profiles" USING "btree" ("approver_id");



CREATE INDEX "idx_cg_profiles_is_super_admin" ON "public"."cg_profiles" USING "btree" ("is_super_admin") WHERE ("is_super_admin" = true);



CREATE INDEX "idx_cg_teams_sort_order" ON "public"."cg_teams" USING "btree" ("sort_order");



CREATE INDEX "idx_cg_todos_user_sort" ON "public"."cg_todos" USING "btree" ("user_id", "sort_order");



CREATE INDEX "idx_cg_vacation_requests_approver_id" ON "public"."cg_vacation_requests" USING "btree" ("approver_id");



CREATE INDEX "idx_cg_vacation_requests_requested_by" ON "public"."cg_vacation_requests" USING "btree" ("requested_by");



CREATE INDEX "idx_cg_vacation_requests_status" ON "public"."cg_vacation_requests" USING "btree" ("status");



CREATE INDEX "idx_message_hides_user" ON "public"."cg_message_hides" USING "btree" ("user_id");



CREATE INDEX "idx_notice_attachments_notice_id" ON "public"."cg_notice_attachments" USING "btree" ("notice_id");



CREATE INDEX "idx_office_devices_status" ON "public"."cg_office_devices" USING "btree" ("status");



CREATE INDEX "idx_office_devices_user" ON "public"."cg_office_devices" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_team_id" ON "public"."cg_profiles" USING "btree" ("team_id");



CREATE INDEX "idx_vacation_cancel_event_id" ON "public"."cg_vacation_cancel_requests" USING "btree" ("event_id");



CREATE INDEX "idx_vacation_cancel_requested_by" ON "public"."cg_vacation_cancel_requests" USING "btree" ("requested_by");



CREATE INDEX "idx_vacation_cancel_status" ON "public"."cg_vacation_cancel_requests" USING "btree" ("status");



CREATE INDEX "idx_vacation_requests_event_id" ON "public"."cg_vacation_requests" USING "btree" ("event_id");



ALTER TABLE ONLY "public"."cg_attendance"
    ADD CONSTRAINT "cg_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_company_settings"
    ADD CONSTRAINT "cg_company_settings_vacation_proxy_user_id_fkey" FOREIGN KEY ("vacation_proxy_user_id") REFERENCES "public"."cg_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_event_categories"
    ADD CONSTRAINT "cg_event_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."cg_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_events"
    ADD CONSTRAINT "cg_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."cg_event_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_events"
    ADD CONSTRAINT "cg_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_events"
    ADD CONSTRAINT "cg_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."cg_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_hr_records"
    ADD CONSTRAINT "cg_hr_records_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."cg_profiles"("id");



ALTER TABLE ONLY "public"."cg_hr_records"
    ADD CONSTRAINT "cg_hr_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_message_hides"
    ADD CONSTRAINT "cg_message_hides_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."cg_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_message_hides"
    ADD CONSTRAINT "cg_message_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_messages"
    ADD CONSTRAINT "cg_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_messages"
    ADD CONSTRAINT "cg_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_messages"
    ADD CONSTRAINT "cg_messages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."cg_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_notice_attachments"
    ADD CONSTRAINT "cg_notice_attachments_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."cg_notices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_notices"
    ADD CONSTRAINT "cg_notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_notices"
    ADD CONSTRAINT "cg_notices_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."cg_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_office_devices"
    ADD CONSTRAINT "cg_office_devices_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."cg_profiles"("id");



ALTER TABLE ONLY "public"."cg_office_devices"
    ADD CONSTRAINT "cg_office_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_office_networks"
    ADD CONSTRAINT "cg_office_networks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."cg_profiles"("id");



ALTER TABLE ONLY "public"."cg_profiles"
    ADD CONSTRAINT "cg_profiles_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "public"."cg_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_profiles"
    ADD CONSTRAINT "cg_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_profiles"
    ADD CONSTRAINT "cg_profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."cg_teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_todos"
    ADD CONSTRAINT "cg_todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_vacation_allocations"
    ADD CONSTRAINT "cg_vacation_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_vacation_cancel_requests"
    ADD CONSTRAINT "cg_vacation_cancel_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."cg_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_vacation_cancel_requests"
    ADD CONSTRAINT "cg_vacation_cancel_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."cg_profiles"("id");



ALTER TABLE ONLY "public"."cg_vacation_cancel_requests"
    ADD CONSTRAINT "cg_vacation_cancel_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."cg_profiles"("id");



ALTER TABLE ONLY "public"."cg_vacation_requests"
    ADD CONSTRAINT "cg_vacation_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "public"."cg_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_vacation_requests"
    ADD CONSTRAINT "cg_vacation_requests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."cg_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_vacation_requests"
    ADD CONSTRAINT "cg_vacation_requests_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."cg_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cg_vacation_requests"
    ADD CONSTRAINT "cg_vacation_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."cg_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cg_vacation_requests"
    ADD CONSTRAINT "cg_vacation_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."cg_profiles"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can update vacation cancel requests" ON "public"."cg_vacation_cancel_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Users and admins can view vacation cancel requests" ON "public"."cg_vacation_cancel_requests" FOR SELECT TO "authenticated" USING ((("requested_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can create own vacation cancel requests" ON "public"."cg_vacation_cancel_requests" FOR INSERT TO "authenticated" WITH CHECK (("requested_by" = "auth"."uid"()));



CREATE POLICY "attachments_delete" ON "public"."cg_notice_attachments" FOR DELETE USING (("public"."is_active_user"() AND ((EXISTS ( SELECT 1
   FROM "public"."cg_notices"
  WHERE (("cg_notices"."id" = "cg_notice_attachments"."notice_id") AND ("cg_notices"."created_by" = "auth"."uid"())))) OR ("public"."current_user_role"() = 'admin'::"text"))));



CREATE POLICY "attachments_insert" ON "public"."cg_notice_attachments" FOR INSERT WITH CHECK (("public"."is_active_user"() AND (EXISTS ( SELECT 1
   FROM "public"."cg_notices"
  WHERE (("cg_notices"."id" = "cg_notice_attachments"."notice_id") AND ("cg_notices"."created_by" = "auth"."uid"()))))));



CREATE POLICY "attachments_select" ON "public"."cg_notice_attachments" FOR SELECT USING ("public"."is_active_user"());



CREATE POLICY "attendance_insert_self" ON "public"."cg_attendance" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."status" = 'active'::"text"))))));



CREATE POLICY "attendance_select_admin" ON "public"."cg_attendance" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text") AND ("cg_profiles"."status" = 'active'::"text")))));



CREATE POLICY "attendance_select_approver" ON "public"."cg_attendance" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_attendance"."user_id") AND ("p"."approver_id" = "auth"."uid"())))));



CREATE POLICY "attendance_select_president_team" ON "public"."cg_attendance" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."cg_profiles" "me"
     JOIN "public"."cg_teams" "t" ON (("t"."id" = "me"."team_id")))
  WHERE (("me"."id" = "auth"."uid"()) AND ("t"."name" = '사장님'::"text") AND ("me"."status" = 'active'::"text")))));



CREATE POLICY "attendance_select_self" ON "public"."cg_attendance" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "attendance_select_super_admin" ON "public"."cg_attendance" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."is_super_admin" = true)))));



CREATE POLICY "attendance_update_self" ON "public"."cg_attendance" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "categories_admin_delete" ON "public"."cg_event_categories" FOR DELETE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "categories_admin_insert" ON "public"."cg_event_categories" FOR INSERT WITH CHECK (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "categories_admin_update" ON "public"."cg_event_categories" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "categories_select" ON "public"."cg_event_categories" FOR SELECT USING ("public"."is_active_user"());



ALTER TABLE "public"."cg_attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_company_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_event_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_hr_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_message_hides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_notice_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_office_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_office_networks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_todos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_vacation_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_vacation_cancel_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cg_vacation_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_delete" ON "public"."cg_events" FOR DELETE USING (("public"."is_active_user"() AND (COALESCE("is_vacation", false) = false) AND (("created_by" = "auth"."uid"()) OR ("public"."current_user_role"() = 'admin'::"text"))));



CREATE POLICY "events_insert" ON "public"."cg_events" FOR INSERT WITH CHECK (("public"."is_active_user"() AND ("created_by" = "auth"."uid"())));



CREATE POLICY "events_select_company" ON "public"."cg_events" FOR SELECT USING ((("visibility" = 'company'::"text") AND "public"."is_active_user"()));



CREATE POLICY "events_select_private" ON "public"."cg_events" FOR SELECT USING ((("visibility" = 'private'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "events_select_team" ON "public"."cg_events" FOR SELECT USING ((("visibility" = 'team'::"text") AND ("team_id" = "public"."current_user_team"()) AND "public"."is_active_user"()));



CREATE POLICY "events_update" ON "public"."cg_events" FOR UPDATE USING (("public"."is_active_user"() AND (("created_by" = "auth"."uid"()) OR ("public"."current_user_role"() = 'admin'::"text"))));



CREATE POLICY "events_vacation_approver_delete" ON "public"."cg_events" FOR DELETE TO "authenticated" USING ((("is_vacation" = true) AND (EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_events"."created_by") AND ("p"."approver_id" = "auth"."uid"()))))));



CREATE POLICY "hr_records_admin_all" ON "public"."cg_hr_records" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND (("cg_profiles"."is_super_admin" = true) OR ("cg_profiles"."role" = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND (("cg_profiles"."is_super_admin" = true) OR ("cg_profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "hr_records_select_own" ON "public"."cg_hr_records" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "message_hides_delete_own" ON "public"."cg_message_hides" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "message_hides_insert_own" ON "public"."cg_message_hides" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "message_hides_select_own" ON "public"."cg_message_hides" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "messages_insert" ON "public"."cg_messages" FOR INSERT WITH CHECK (("public"."is_active_user"() AND ("sender_id" = "auth"."uid"())));



CREATE POLICY "messages_select" ON "public"."cg_messages" FOR SELECT USING (("public"."is_active_user"() AND (("sender_id" = "auth"."uid"()) OR ("recipient_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND ("team_id" = "public"."current_user_team"())))));



CREATE POLICY "messages_update" ON "public"."cg_messages" FOR UPDATE USING ((("recipient_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND ("team_id" = "public"."current_user_team"()))));



CREATE POLICY "notices_delete" ON "public"."cg_notices" FOR DELETE USING (("public"."is_active_user"() AND (("created_by" = "auth"."uid"()) OR ("public"."current_user_role"() = 'admin'::"text"))));



CREATE POLICY "notices_insert" ON "public"."cg_notices" FOR INSERT WITH CHECK (("public"."is_active_user"() AND ("created_by" = "auth"."uid"())));



CREATE POLICY "notices_select_company" ON "public"."cg_notices" FOR SELECT USING ((("visibility" = 'company'::"text") AND "public"."is_active_user"()));



CREATE POLICY "notices_select_team" ON "public"."cg_notices" FOR SELECT USING ((("visibility" = 'team'::"text") AND ("team_id" = "public"."current_user_team"()) AND "public"."is_active_user"()));



CREATE POLICY "notices_update" ON "public"."cg_notices" FOR UPDATE USING (("public"."is_active_user"() AND (("created_by" = "auth"."uid"()) OR ("public"."current_user_role"() = 'admin'::"text"))));



CREATE POLICY "office_devices_admin_all" ON "public"."cg_office_devices" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND (("cg_profiles"."is_super_admin" = true) OR ("cg_profiles"."role" = 'admin'::"text")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND (("cg_profiles"."is_super_admin" = true) OR ("cg_profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "office_devices_delete_own" ON "public"."cg_office_devices" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "office_devices_insert_own" ON "public"."cg_office_devices" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "office_devices_select_own" ON "public"."cg_office_devices" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "office_devices_update_own" ON "public"."cg_office_devices" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "office_networks_admin_write" ON "public"."cg_office_networks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text")))));



CREATE POLICY "office_networks_select_authed" ON "public"."cg_office_networks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_insert" ON "public"."cg_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_active" ON "public"."cg_profiles" FOR SELECT USING ("public"."is_active_user"());



CREATE POLICY "profiles_select_self" ON "public"."cg_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_admin" ON "public"."cg_profiles" FOR UPDATE USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "profiles_update_self" ON "public"."cg_profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "settings_read_active" ON "public"."cg_company_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."status" = 'active'::"text")))));



CREATE POLICY "settings_write_admin" ON "public"."cg_company_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text") AND ("cg_profiles"."status" = 'active'::"text")))));



CREATE POLICY "teams_admin" ON "public"."cg_teams" USING (("public"."current_user_role"() = 'admin'::"text"));



CREATE POLICY "teams_select" ON "public"."cg_teams" FOR SELECT USING ("public"."is_active_user"());



CREATE POLICY "todos_own" ON "public"."cg_todos" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "vac_req_approver_update" ON "public"."cg_vacation_requests" FOR UPDATE TO "authenticated" USING ((("approver_id" = "auth"."uid"()) OR (("approver_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text")))))));



CREATE POLICY "vac_req_select" ON "public"."cg_vacation_requests" FOR SELECT TO "authenticated" USING ((("requested_by" = "auth"."uid"()) OR ("approver_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "vac_req_self_insert" ON "public"."cg_vacation_requests" FOR INSERT TO "authenticated" WITH CHECK (("requested_by" = "auth"."uid"()));



CREATE POLICY "vac_req_self_withdraw" ON "public"."cg_vacation_requests" FOR DELETE TO "authenticated" USING ((("requested_by" = "auth"."uid"()) AND ("status" = 'pending'::"text")));



CREATE POLICY "vacation_alloc_admin_all" ON "public"."cg_vacation_allocations" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles"
  WHERE (("cg_profiles"."id" = "auth"."uid"()) AND ("cg_profiles"."role" = 'admin'::"text") AND ("cg_profiles"."status" = 'active'::"text")))));



CREATE POLICY "vacation_alloc_approver_select" ON "public"."cg_vacation_allocations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_vacation_allocations"."user_id") AND ("p"."approver_id" = "auth"."uid"())))));



CREATE POLICY "vacation_alloc_approver_write" ON "public"."cg_vacation_allocations" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_vacation_allocations"."user_id") AND ("p"."approver_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_vacation_allocations"."user_id") AND ("p"."approver_id" = "auth"."uid"())))));



CREATE POLICY "vacation_alloc_select_self" ON "public"."cg_vacation_allocations" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "vacation_cancel_approver_select" ON "public"."cg_vacation_cancel_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_vacation_cancel_requests"."requested_by") AND ("p"."approver_id" = "auth"."uid"())))));



CREATE POLICY "vacation_cancel_approver_update" ON "public"."cg_vacation_cancel_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cg_profiles" "p"
  WHERE (("p"."id" = "cg_vacation_cancel_requests"."requested_by") AND ("p"."approver_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_attendance";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_office_devices";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."approve_vacation_cancel"("p_cancel_id" "uuid", "p_reviewer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_vacation_cancel"("p_cancel_id" "uuid", "p_reviewer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_vacation_request"("p_request_id" "uuid", "p_reviewer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_vacation_request"("p_request_id" "uuid", "p_reviewer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_team"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_team"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_team"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_current_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_super_admin"() TO "service_role";


















GRANT ALL ON TABLE "public"."cg_attendance" TO "anon";
GRANT ALL ON TABLE "public"."cg_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."cg_company_settings" TO "anon";
GRANT ALL ON TABLE "public"."cg_company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."cg_event_categories" TO "anon";
GRANT ALL ON TABLE "public"."cg_event_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_event_categories" TO "service_role";



GRANT ALL ON TABLE "public"."cg_events" TO "anon";
GRANT ALL ON TABLE "public"."cg_events" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_events" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."cg_hr_records" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."cg_hr_records" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_hr_records" TO "service_role";



GRANT SELECT("user_id") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("hire_date") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("phone") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("emergency_contact") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("address") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("updated_by") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("education") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("career") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("certificates") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT SELECT("hire_position") ON TABLE "public"."cg_hr_records" TO "authenticated";



GRANT ALL ON TABLE "public"."cg_message_hides" TO "anon";
GRANT ALL ON TABLE "public"."cg_message_hides" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_message_hides" TO "service_role";



GRANT ALL ON TABLE "public"."cg_messages" TO "anon";
GRANT ALL ON TABLE "public"."cg_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_messages" TO "service_role";



GRANT ALL ON TABLE "public"."cg_notice_attachments" TO "anon";
GRANT ALL ON TABLE "public"."cg_notice_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_notice_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."cg_notices" TO "anon";
GRANT ALL ON TABLE "public"."cg_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_notices" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cg_office_devices" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cg_office_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_office_devices" TO "service_role";



GRANT UPDATE("last_ip") ON TABLE "public"."cg_office_devices" TO "authenticated";



GRANT UPDATE("last_used_at") ON TABLE "public"."cg_office_devices" TO "authenticated";



GRANT ALL ON TABLE "public"."cg_office_networks" TO "anon";
GRANT ALL ON TABLE "public"."cg_office_networks" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_office_networks" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cg_profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cg_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."cg_profiles" TO "authenticated";



GRANT UPDATE("team_id") ON TABLE "public"."cg_profiles" TO "authenticated";



GRANT UPDATE("color") ON TABLE "public"."cg_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."cg_teams" TO "anon";
GRANT ALL ON TABLE "public"."cg_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_teams" TO "service_role";



GRANT ALL ON TABLE "public"."cg_todos" TO "anon";
GRANT ALL ON TABLE "public"."cg_todos" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_todos" TO "service_role";



GRANT ALL ON TABLE "public"."cg_vacation_allocations" TO "anon";
GRANT ALL ON TABLE "public"."cg_vacation_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_vacation_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."cg_vacation_cancel_requests" TO "anon";
GRANT ALL ON TABLE "public"."cg_vacation_cancel_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_vacation_cancel_requests" TO "service_role";



GRANT ALL ON TABLE "public"."cg_vacation_requests" TO "anon";
GRANT ALL ON TABLE "public"."cg_vacation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."cg_vacation_requests" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- [부록] pg_dump(public 스키마)에 포함되지 않는 필수 설정
-- 새 프로젝트에 이 베이스라인을 적용할 때 아래도 함께 실행되어야 함
--

-- 1) auth.users 트리거 (신규 가입 시 cg_profiles 자동 생성)
CREATE OR REPLACE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- 2) Realtime publication — 코드가 구독하는 나머지 테이블
--    (cg_attendance, cg_messages, cg_office_devices는 위 본문에 포함됨)
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_vacation_requests";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_vacation_cancel_requests";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_profiles";
ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cg_events";

-- 3) 권한 축소 (step28/step30) — 새 프로젝트의 기본 권한(default privileges)이
--    anon/authenticated에 자동 부여한 것을 구 프로젝트와 동일하게 제거.
--    주의: 테이블 레벨 REVOKE는 컬럼 레벨 grant도 함께 제거하므로 반드시 재부여.
REVOKE EXECUTE ON FUNCTION "public"."approve_vacation_cancel"(uuid, uuid) FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."approve_vacation_request"(uuid, uuid) FROM "anon", "authenticated";
REVOKE SELECT ON "public"."cg_hr_records" FROM "anon", "authenticated";
REVOKE INSERT, UPDATE ON "public"."cg_office_devices" FROM "anon", "authenticated";
REVOKE UPDATE ON "public"."cg_profiles" FROM "anon", "authenticated";
GRANT SELECT ("address", "career", "certificates", "education", "emergency_contact", "hire_date", "hire_position", "phone", "updated_at", "updated_by", "user_id") ON "public"."cg_hr_records" TO "authenticated";
GRANT UPDATE ("last_ip", "last_used_at") ON "public"."cg_office_devices" TO "authenticated";
GRANT UPDATE ("color", "full_name", "team_id") ON "public"."cg_profiles" TO "authenticated";
