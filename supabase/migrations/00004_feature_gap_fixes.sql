-- Feature gap fixes:
-- - user settings server persistence
-- - push subscription persistence
-- - AI photo daily usage tracking

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notification_settings JSONB NOT NULL DEFAULT '{
    "taskReminder": true,
    "socialNotifications": true,
    "systemNotifications": true,
    "challengeNotifications": true
  }'::jsonb,
  privacy_settings JSONB NOT NULL DEFAULT '{
    "showOnLeaderboard": true,
    "publicProfile": true,
    "allowSearch": true
  }'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_ai_usage_per_day UNIQUE (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_date ON ai_usage_logs(user_id, usage_date);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_policy ON user_settings;
CREATE POLICY user_settings_policy ON user_settings
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_read_policy ON push_subscriptions;
CREATE POLICY push_subscriptions_read_policy ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_write_policy ON push_subscriptions;
CREATE POLICY push_subscriptions_write_policy ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_policy ON push_subscriptions;
CREATE POLICY push_subscriptions_update_policy ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_policy ON push_subscriptions;
CREATE POLICY push_subscriptions_delete_policy ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_usage_logs_policy ON ai_usage_logs;
CREATE POLICY ai_usage_logs_policy ON ai_usage_logs
  FOR ALL USING (auth.uid() = user_id);
