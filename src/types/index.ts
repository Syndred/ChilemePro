// ============================================================
// 吃了么 APP - Core TypeScript Types
// ============================================================

// --- Enums / Literal Unions ---

export type Gender = 'male' | 'female' | 'other';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'failed';

export type MembershipTier = 'free' | 'monthly' | 'yearly';

export type PostStatus = 'published' | 'reviewing' | 'rejected';

export type RewardTransactionType = 'daily_reward' | 'pool_bonus' | 'withdrawal';

export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type PaymentTransactionType = 'deposit' | 'membership';

export type PaymentMethod = 'wechat' | 'alipay' | 'stripe';

export type PaymentProvider = 'wechat' | 'alipay' | 'stripe';

export type AntiCheatSeverity = 'low' | 'medium' | 'high';

export type ModerationDecision = 'approved' | 'rejected' | 'pending';

// --- Core Interfaces ---

export interface UserProfile {
  nickname: string;
  avatar: string;
  height: number;        // cm, 100-250
  weight: number;        // kg, 30-300
  targetWeight: number;  // kg
  age: number;           // 10-120
  gender: Gender;
  activityLevel: ActivityLevel;
  dailyCalorieTarget: number;
}

export interface User {
  id: string;
  phone: string | null;
  wechatId: string | null;
  profile: UserProfile;
  membershipTier: MembershipTier;
  membershipExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FoodItem {
  id: string;
  mealRecordId: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  serving: number;
  unit: string;
  createdAt: Date;
}

export interface MealRecord {
  id: string;
  userId: string;
  mealType: MealType;
  foods: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  imageUrl: string | null;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyTask {
  id: string;
  challengeId: string;
  day: number;           // 1-7
  taskDate: Date;
  completed: boolean;
  reward: number;
  mealRecorded: boolean;
  calorieTargetMet: boolean;
  exerciseTargetMet: boolean | null;
  checkedAt: Date | null;
  createdAt: Date;
}

export interface Challenge {
  id: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  deposit: number;
  totalReward: number;
  rewardPool: number;
  status: ChallengeStatus;
  dailyTasks: DailyTask[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  user: {
    nickname: string;
    avatar: string;
  };
  content: string;
  createdAt: Date;
}

export interface SocialPost {
  id: string;
  userId: string;
  user: {
    nickname: string;
    avatar: string;
  };
  content: string;
  images: string[];
  mealRecordId: string | null;
  likes: number;
  comments: Comment[];
  isLiked: boolean;
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeightRecord {
  id: string;
  userId: string;
  weight: number;
  recordedAt: Date;
  createdAt: Date;
}

export interface RewardTransaction {
  id: string;
  userId: string;
  challengeId: string | null;
  type: RewardTransactionType;
  amount: number;
  balanceAfter: number;
  status: TransactionStatus;
  paymentMethod: PaymentMethod | null;
  paymentAccount: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

export interface PaymentTransaction {
  id: string;
  userId: string;
  challengeId: string | null;
  type: PaymentTransactionType;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentProvider: PaymentProvider;
  transactionId: string;
  status: TransactionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AntiCheatLog {
  id: string;
  userId: string;
  deviceId: string | null;
  ipAddress: string | null;
  actionType: string;
  suspiciousReason: string;
  severity: AntiCheatSeverity;
  status: 'pending' | 'reviewed' | 'confirmed' | 'dismissed';
  createdAt: Date;
}

export interface ContentModerationLog {
  id: string;
  postId: string;
  reporterId: string | null;
  reason: string | null;
  aiResult: Record<string, unknown> | null;
  moderatorId: string | null;
  decision: ModerationDecision;
  createdAt: Date;
  reviewedAt: Date | null;
}

// --- AI Service Types ---

export interface RecognizedFood {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  confidence: number;
}

export interface FoodRecognitionResult {
  success: boolean;
  foods: RecognizedFood[];
  confidence: number;
  processingTime: number;
}

export interface NutritionAnalysis {
  totalCalories: number;
  targetCalories: number;
  proteinRatio: number;
  fatRatio: number;
  carbsRatio: number;
  isOverTarget: boolean;
  isUnderTarget: boolean;
  suggestions: string[];
}

export interface HealthAdvice {
  date: Date;
  calorieStatus: 'over' | 'under' | 'on_target';
  mealSuggestions: string[];
  exerciseSuggestions: string[];
  nutritionTips: string[];
}

// --- Input Types (for Server Actions) ---

export interface CreateMealRecordInput {
  mealType: MealType;
  foods: Omit<FoodItem, 'id' | 'mealRecordId' | 'createdAt'>[];
  imageUrl?: string;
  recordedAt: Date;
}

export interface UpdateMealRecordInput {
  mealType?: MealType;
  foods?: Omit<FoodItem, 'id' | 'mealRecordId' | 'createdAt'>[];
  imageUrl?: string;
}

export interface CreatePostInput {
  content: string;
  images: string[];
  mealRecordId?: string;
}

export interface UserProfileInput {
  nickname: string;
  avatar?: string;
  height: number;
  weight: number;
  targetWeight: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
}

// --- Leaderboard Types ---

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatar: string;
  completedDays: number;
  /** Timestamp of the latest completed task (for tiebreaking) */
  lastCompletedAt: Date | null;
}

// --- System Outage Types ---

export type OutageStatus = 'active' | 'resolved';

export type AppealStatus = 'pending' | 'approved' | 'rejected';

export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SystemOutage {
  id: string;
  startTime: Date;
  endTime: Date | null;
  description: string;
  status: OutageStatus;
  affectedServices: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAppeal {
  id: string;
  userId: string;
  challengeId: string | null;
  outageId: string | null;
  reason: string;
  status: AppealStatus;
  refundAmount: number | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutageRefund {
  id: string;
  userId: string;
  challengeId: string;
  outageId: string;
  refundAmount: number;
  status: RefundStatus;
  processedAt: Date | null;
  createdAt: Date;
}
