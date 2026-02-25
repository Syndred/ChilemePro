-- ============================================
-- Performance Indexes
-- ============================================

CREATE INDEX idx_meal_records_user_date ON meal_records(user_id, recorded_at);
CREATE INDEX idx_challenges_user_status ON challenges(user_id, status);
CREATE INDEX idx_daily_tasks_challenge ON daily_tasks(challenge_id, day);
CREATE INDEX idx_social_posts_user ON social_posts(user_id, created_at);
CREATE INDEX idx_post_likes_post ON post_likes(post_id);
CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_id);
CREATE INDEX idx_weight_records_user_date ON weight_records(user_id, recorded_at);
CREATE INDEX idx_reward_transactions_user ON reward_transactions(user_id, created_at);
