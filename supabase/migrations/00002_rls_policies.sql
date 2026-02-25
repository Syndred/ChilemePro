-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Users: 用户只能查看和修改自己的数据
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_policy ON users
  FOR ALL USING (auth.uid() = id);

-- Meal Records: 用户只能操作自己的饮食记录
ALTER TABLE meal_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY meal_records_policy ON meal_records
  FOR ALL USING (auth.uid() = user_id);

-- Food Items: 用户只能操作自己饮食记录中的食物条目
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY food_items_policy ON food_items
  FOR ALL USING (
    meal_record_id IN (
      SELECT id FROM meal_records WHERE user_id = auth.uid()
    )
  );

-- Challenges: 用户只能操作自己的挑战
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY challenges_policy ON challenges
  FOR ALL USING (auth.uid() = user_id);

-- Daily Tasks: 用户只能操作自己挑战中的每日任务
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_tasks_policy ON daily_tasks
  FOR ALL USING (
    challenge_id IN (
      SELECT id FROM challenges WHERE user_id = auth.uid()
    )
  );

-- Social Posts: 可查看关注用户的已发布动态，只能写/改/删自己的
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_posts_read_policy ON social_posts
  FOR SELECT USING (
    status = 'published' AND (
      user_id = auth.uid() OR
      user_id IN (SELECT following_id FROM user_follows WHERE follower_id = auth.uid())
    )
  );
CREATE POLICY social_posts_write_policy ON social_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY social_posts_update_policy ON social_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY social_posts_delete_policy ON social_posts
  FOR DELETE USING (auth.uid() = user_id);

-- Post Likes: 用户可以查看所有点赞，只能操作自己的点赞
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_likes_read_policy ON post_likes
  FOR SELECT USING (true);
CREATE POLICY post_likes_write_policy ON post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_likes_delete_policy ON post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- Post Comments: 用户可以查看所有评论，只能创建和删除自己的评论
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_comments_read_policy ON post_comments
  FOR SELECT USING (true);
CREATE POLICY post_comments_write_policy ON post_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_comments_delete_policy ON post_comments
  FOR DELETE USING (auth.uid() = user_id);

-- User Follows: 用户可以查看所有关注关系，只能操作自己的关注
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_follows_read_policy ON user_follows
  FOR SELECT USING (true);
CREATE POLICY user_follows_write_policy ON user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY user_follows_delete_policy ON user_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Weight Records: 用户只能操作自己的体重记录
ALTER TABLE weight_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY weight_records_policy ON weight_records
  FOR ALL USING (auth.uid() = user_id);

-- Reward Transactions: 用户只能查看自己的奖励记录
ALTER TABLE reward_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_transactions_policy ON reward_transactions
  FOR ALL USING (auth.uid() = user_id);

-- Payment Transactions: 用户只能查看自己的支付记录
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_transactions_policy ON payment_transactions
  FOR ALL USING (auth.uid() = user_id);

-- Anti Cheat Logs: 用户只能查看自己的记录（管理员可通过 service role 查看全部）
ALTER TABLE anti_cheat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY anti_cheat_logs_policy ON anti_cheat_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Content Moderation Logs: 举报者可查看自己的举报记录
ALTER TABLE content_moderation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_moderation_logs_policy ON content_moderation_logs
  FOR SELECT USING (auth.uid() = reporter_id);
