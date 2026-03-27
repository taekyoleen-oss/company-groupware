-- Helper functions
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM cg_profiles WHERE id = auth.uid() AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM cg_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_user_team()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT team_id FROM cg_profiles WHERE id = auth.uid();
$$;

-- Enable RLS
ALTER TABLE cg_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_notice_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cg_todos ENABLE ROW LEVEL SECURITY;

-- cg_teams: all active users can read
CREATE POLICY "teams_select" ON cg_teams FOR SELECT USING (is_active_user());
CREATE POLICY "teams_admin" ON cg_teams FOR ALL USING (current_user_role() = 'admin');

-- cg_profiles
CREATE POLICY "profiles_select_self" ON cg_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_active" ON cg_profiles FOR SELECT USING (is_active_user());
CREATE POLICY "profiles_update_self" ON cg_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON cg_profiles FOR UPDATE USING (current_user_role() = 'admin');
CREATE POLICY "profiles_insert" ON cg_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- cg_events
CREATE POLICY "events_select_company" ON cg_events FOR SELECT USING (visibility = 'company' AND is_active_user());
CREATE POLICY "events_select_team" ON cg_events FOR SELECT USING (visibility = 'team' AND team_id = current_user_team() AND is_active_user());
CREATE POLICY "events_select_private" ON cg_events FOR SELECT USING (visibility = 'private' AND created_by = auth.uid());
CREATE POLICY "events_insert" ON cg_events FOR INSERT WITH CHECK (is_active_user() AND created_by = auth.uid());
CREATE POLICY "events_update" ON cg_events FOR UPDATE USING (is_active_user() AND (created_by = auth.uid() OR current_user_role() = 'admin'));
CREATE POLICY "events_delete" ON cg_events FOR DELETE USING (is_active_user() AND (created_by = auth.uid() OR current_user_role() = 'admin'));

-- cg_event_categories
CREATE POLICY "categories_select" ON cg_event_categories FOR SELECT USING (is_active_user());
CREATE POLICY "categories_admin_insert" ON cg_event_categories FOR INSERT WITH CHECK (current_user_role() = 'admin');
CREATE POLICY "categories_admin_update" ON cg_event_categories FOR UPDATE USING (current_user_role() = 'admin');
CREATE POLICY "categories_admin_delete" ON cg_event_categories FOR DELETE USING (current_user_role() = 'admin');

-- cg_notices
CREATE POLICY "notices_select_company" ON cg_notices FOR SELECT USING (visibility = 'company' AND is_active_user());
CREATE POLICY "notices_select_team" ON cg_notices FOR SELECT USING (visibility = 'team' AND team_id = current_user_team() AND is_active_user());
CREATE POLICY "notices_insert" ON cg_notices FOR INSERT WITH CHECK (is_active_user() AND created_by = auth.uid());
CREATE POLICY "notices_update" ON cg_notices FOR UPDATE USING (is_active_user() AND (created_by = auth.uid() OR current_user_role() = 'admin'));
CREATE POLICY "notices_delete" ON cg_notices FOR DELETE USING (is_active_user() AND (created_by = auth.uid() OR current_user_role() = 'admin'));

-- cg_notice_attachments
CREATE POLICY "attachments_select" ON cg_notice_attachments FOR SELECT USING (is_active_user());
CREATE POLICY "attachments_insert" ON cg_notice_attachments FOR INSERT WITH CHECK (is_active_user() AND EXISTS (SELECT 1 FROM cg_notices WHERE id = notice_id AND created_by = auth.uid()));
CREATE POLICY "attachments_delete" ON cg_notice_attachments FOR DELETE USING (is_active_user() AND (EXISTS (SELECT 1 FROM cg_notices WHERE id = notice_id AND created_by = auth.uid()) OR current_user_role() = 'admin'));

-- cg_todos
CREATE POLICY "todos_own" ON cg_todos FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
