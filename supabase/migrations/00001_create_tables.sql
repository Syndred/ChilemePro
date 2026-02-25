-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE,
  wechat_id VARCHAR(100) UNIQUE,
  nickname VARCHAR(50) NOT NULL,
  avatar TEXT,
  height DECIMAL(5,2),
  weight DECIMAL(5,2),
  target_weight DECIMAL(5,2),
  age INTEGER,
  gender VARCHAR(10),
  activity_level VARCHAR(20),
  daily_calorie_target INTEGER,
  membership_tier VARCHAR(20) DEFAULT 'free',
  membership_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 饮食记录表
CREATE TABLE meal_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  meal_type VARCHAR(20) NOT NULL,
  total_calories DECIMAL(8,2) NOT NULL,
  total_protein DECIMAL(8,2),
  total_fat DECIMAL(8,2),
  total_carbs DECIMAL(8,2),
  image_url TEXT,
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 食物条目表
CREATE TABLE food_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_record_id UUID REFERENCES meal_records(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  calories DECIMAL(8,2) NOT NULL,
  protein DECIMAL(8,2),
  fat DECIMAL(8,2),
  carbs DECIMAL(8,2),
  serving DECIMAL(8,2),
  unit VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 挑战表
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  deposit DECIMAL(10,2) NOT NULL,
  total_reward DECIMAL(10,2) DEFAULT 0,
  reward_pool DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT one_active_challenge_per_user UNIQUE (user_id, status)
);

-- 每日任务表
CREATE TABLE daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  task_date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  reward DECIMAL(10,2) NOT NULL,
  meal_recorded BOOLEAN DEFAULT FALSE,
  calorie_target_met BOOLEAN DEFAULT FALSE,
  exercise_target_met BOOLEAN,
  checked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_day_per_challenge UNIQUE (challenge_id, day)
);

-- 社交动态表
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT,
  images TEXT[],
  meal_record_id UUID REFERENCES meal_records(id) ON DELETE SET NULL,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'published',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 点赞表
CREATE TABLE post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_like UNIQUE (post_id, user_id)
);

-- 评论表
CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 关注表
CREATE TABLE user_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_follow UNIQUE (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- 体重记录表
CREATE TABLE weight_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  weight DECIMAL(5,2) NOT NULL,
  recorded_at DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_weight_per_day UNIQUE (user_id, recorded_at)
);

-- 奖励记录表
CREATE TABLE reward_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  payment_method VARCHAR(20),
  payment_account VARCHAR(100),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 支付记录表
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  payment_provider VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(100) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 防作弊记录表
CREATE TABLE anti_cheat_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(100),
  ip_address INET,
  action_type VARCHAR(50),
  suspicious_reason TEXT,
  severity VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 内容审核记录表
CREATE TABLE content_moderation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  ai_result JSONB,
  moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);
