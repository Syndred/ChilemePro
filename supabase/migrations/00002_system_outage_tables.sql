-- System outage tracking table
-- Requirement 24.1: Record outage time periods
CREATE TABLE system_outages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  affected_services TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User appeals table
-- Requirement 24.5: User appeal channel
-- Requirement 24.6: Process refund within 3 business days
CREATE TABLE user_appeals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  outage_id UUID REFERENCES system_outages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  refund_amount DECIMAL(10,2),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Outage refunds table
-- Requirement 24.4: Full deposit refund for outage-caused failures
CREATE TABLE outage_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  outage_id UUID REFERENCES system_outages(id) ON DELETE SET NULL,
  refund_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_system_outages_status ON system_outages(status);
CREATE INDEX idx_system_outages_start_time ON system_outages(start_time);
CREATE INDEX idx_user_appeals_user ON user_appeals(user_id, status);
CREATE INDEX idx_user_appeals_challenge ON user_appeals(challenge_id);
CREATE INDEX idx_outage_refunds_user ON outage_refunds(user_id);
CREATE INDEX idx_outage_refunds_challenge ON outage_refunds(challenge_id);

-- RLS policies
ALTER TABLE system_outages ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_outages_read_policy ON system_outages
  FOR SELECT USING (true);

ALTER TABLE user_appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_appeals_policy ON user_appeals
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE outage_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY outage_refunds_policy ON outage_refunds
  FOR ALL USING (auth.uid() = user_id);
