# 需求文档 - 吃了么 APP

## 简介

吃了么是一个极简三餐饮食记录 PWA 应用，集成 AI 拍照识别热量、健康激励返现和轻社交功能。面向减脂、控重、健身、健康管理和日常饮食记录用户，通过押金激励机制和 AI 智能分析帮助用户养成健康饮食习惯。

## 术语表

- **System**: 吃了么应用系统
- **User**: 使用应用的终端用户
- **Meal_Record**: 饮食记录，包含食物、热量、营养信息
- **AI_Vision_Service**: AI 图像识别服务，用于识别食物和计算热量
- **Challenge**: 健康周计划挑战
- **Deposit**: 用户参与挑战支付的押金
- **Reward_Pool**: 奖金池，收集未完成挑战用户的押金
- **Daily_Task**: 每日任务，包括三餐记录和热量达标
- **Calorie_Target**: 每日推荐热量目标
- **Nutrition_Data**: 营养数据，包括蛋白质、脂肪、碳水化合物
- **Social_Feed**: 饮食朋友圈动态
- **PWA**: Progressive Web App，渐进式 Web 应用

## 需求

### 需求 1: 用户认证与注册

**用户故事**: 作为新用户，我希望能够快速注册和登录，以便开始使用应用记录饮食。

#### 验收标准

1. WHEN 用户选择手机号登录 THEN THE System SHALL 发送验证码到用户手机
2. WHEN 用户输入正确的验证码 THEN THE System SHALL 创建或登录用户账户
3. WHEN 用户选择微信登录 THEN THE System SHALL 通过微信 OAuth 完成认证
4. WHEN 验证码输入错误超过 3 次 THEN THE System SHALL 锁定该手机号 15 分钟
5. WHEN 新用户首次登录 THEN THE System SHALL 引导用户完成基础信息设置

### 需求 2: 用户基础信息管理

**用户故事**: 作为用户，我希望设置我的身体信息，以便系统为我计算个性化的热量目标。

#### 验收标准

1. THE System SHALL 收集用户的身高、体重、目标体重、年龄、性别和活动量
2. WHEN 用户完成基础信息输入 THEN THE System SHALL 根据 Harris-Benedict 公式计算每日推荐热量
3. WHEN 用户修改基础信息 THEN THE System SHALL 重新计算每日推荐热量
4. THE System SHALL 验证身高范围在 100-250 厘米之间
5. THE System SHALL 验证体重范围在 30-300 公斤之间
6. THE System SHALL 验证年龄范围在 10-120 岁之间

### 需求 3: 饮食记录 - 手动添加

**用户故事**: 作为用户，我希望能够手动添加饮食记录，以便在无法拍照时也能记录我的饮食。

#### 验收标准

1. WHEN 用户选择添加餐次（早餐/午餐/晚餐/加餐）THEN THE System SHALL 显示食物选择界面
2. WHEN 用户选择食物和份量 THEN THE System SHALL 计算并显示该食物的热量和营养信息
3. WHEN 用户确认添加 THEN THE System SHALL 保存 Meal_Record 到数据库
4. WHEN 用户添加饮食记录 THEN THE System SHALL 更新当日热量统计
5. THE System SHALL 支持用户搜索食物数据库中的食物
6. THE System SHALL 允许用户自定义食物和热量

### 需求 4: 饮食记录 - AI 拍照识别

**用户故事**: 作为用户，我希望通过拍照快速记录饮食，以便节省手动输入的时间。

#### 验收标准

1. WHEN 用户选择拍照添加 THEN THE System SHALL 打开相机或相册
2. WHEN 用户上传食物照片 THEN THE System SHALL 调用 AI_Vision_Service 识别食物
3. WHEN AI_Vision_Service 返回识别结果 THEN THE System SHALL 显示识别的食物名称、热量和营养信息
4. WHEN AI 识别结果不准确 THEN THE System SHALL 允许用户手动修正
5. WHEN AI 识别超时或失败 THEN THE System SHALL 自动转为手动录入模式并提供常见食物候选列表
6. WHEN 照片上传失败 THEN THE System SHALL 显示错误信息并允许重试
7. THE System SHALL 尝试在 10 秒内完成 AI 识别，超时则转为手动模式

### 需求 5: 热量追踪与可视化

**用户故事**: 作为用户，我希望实时看到我的热量摄入情况，以便控制我的饮食。

#### 验收标准

1. THE System SHALL 在首页显示当日已摄入热量和目标热量
2. THE System SHALL 使用进度条可视化热量摄入百分比
3. WHEN 热量摄入超过目标 THEN THE System SHALL 将进度条显示为警告颜色
4. WHEN 热量摄入达到目标的 80%-100% THEN THE System SHALL 将进度条显示为正常颜色
5. THE System SHALL 实时更新热量统计当用户添加或删除饮食记录时
6. THE System SHALL 显示蛋白质、脂肪、碳水化合物的摄入量和占比

### 需求 6: 历史记录查看

**用户故事**: 作为用户，我希望查看我的历史饮食记录，以便了解我的饮食习惯。

#### 验收标准

1. THE System SHALL 支持用户按日期查看历史饮食记录
2. WHEN 用户选择某一天 THEN THE System SHALL 显示该天的所有 Meal_Record
3. THE System SHALL 显示每天的总热量和营养摄入
4. THE System SHALL 支持用户编辑或删除历史记录
5. WHEN 用户删除历史记录 THEN THE System SHALL 重新计算该天的热量统计

### 需求 7: AI 健康分析与建议

**用户故事**: 作为用户，我希望获得 AI 的健康建议，以便改善我的饮食习惯。

#### 验收标准

1. WHEN 用户当日热量超标 THEN THE System SHALL 提供下一餐的低热量建议和推荐运动
2. WHEN 用户当日热量不足 THEN THE System SHALL 推荐补充食物
3. THE System SHALL 分析用户的营养摄入比例并提供优化建议
4. THE System SHALL 每日生成个性化的健康建议
5. WHEN 用户连续 3 天热量超标 THEN THE System SHALL 发送提醒通知

### 需求 8: 数据统计与图表

**用户故事**: 作为用户，我希望看到我的饮食趋势图表，以便了解我的长期进展。

#### 验收标准

1. THE System SHALL 提供周热量趋势图表
2. THE System SHALL 提供月热量趋势图表
3. THE System SHALL 提供体重变化曲线图
4. WHEN 用户查看图表 THEN THE System SHALL 显示数据点的具体数值
5. THE System SHALL 支持用户记录每日体重
6. THE System SHALL 计算并显示体重变化趋势

### 需求 9: 健康周计划挑战 - 参与

**用户故事**: 作为用户，我希望参与健康周计划挑战，以便通过激励机制养成健康习惯。

#### 验收标准

1. WHEN 用户选择参与 Challenge THEN THE System SHALL 要求用户支付 100 元 Deposit
2. WHEN 支付成功 THEN THE System SHALL 创建为期 7 自然日的 Challenge，从支付成功当日 00:00 开始
3. THE System SHALL 定义每日任务：完成三餐记录、热量达标
4. THE System SHALL 定义可选任务：运动或步数达标
5. WHEN 用户已有进行中的 Challenge THEN THE System SHALL 阻止创建新的 Challenge
6. WHEN Challenge 已开始 THEN THE System SHALL 禁止用户退出且不退还 Deposit
7. WHEN Challenge 未开始 THEN THE System SHALL 允许用户撤销并全额退款
8. THE System SHALL 在 Challenge 开始时锁定用户的 Deposit

### 需求 10: 健康周计划挑战 - 每日任务完成

**用户故事**: 作为参与挑战的用户，我希望完成每日任务并获得返现，以便获得激励。

#### 验收标准

1. THE System SHALL 设置每日任务截止时间为 23:30
2. WHEN 时间超过 23:30 THEN THE System SHALL 不接受当日补录
3. THE System SHALL 在 23:30 至 23:59 期间执行自动结算
4. WHEN 用户完成当日所有必需任务 THEN THE System SHALL 标记该日为已完成
5. THE System SHALL 根据完成天数计算返现金额：D1=6元, D2=8元, D3=10元, D4=12元, D5=15元, D6=20元, D7=29元
6. WHEN 用户完成当日任务 THEN THE System SHALL 将返现金额添加到用户账户
7. WHEN 用户未完成当日任务 THEN THE System SHALL 将该日返现金额转入 Reward_Pool
8. THE System SHALL 判定任务完成标准：必须完成三餐或加餐记录，且当日热量误差不超过目标的正负 10%
9. THE System SHALL 在 22:00 发送任务提醒通知给未完成用户

### 需求 11: 健康周计划挑战 - 奖金池分配

**用户故事**: 作为全勤完成挑战的用户，我希望获得奖金池的额外奖励，以便获得更多激励。

#### 验收标准

1. WHEN Challenge 周期结束 THEN THE System SHALL 计算 Reward_Pool 总额为所有未完成日次的金额总和
2. THE System SHALL 从 Reward_Pool 中扣除 15% 作为平台抽成
3. THE System SHALL 将剩余 85% 平均分配给全勤完成的用户
4. WHEN 用户完成全部 7 天任务 THEN THE System SHALL 标记用户为全勤用户
5. THE System SHALL 限制单人奖励上限不超过 Deposit 的 2 倍
6. WHEN 没有全勤用户 THEN THE System SHALL 将剩余 85% 滚入下一期奖金池
7. THE System SHALL 在 Challenge 结束后 24 小时内完成奖金分配

### 需求 12: 挑战排行榜

**用户故事**: 作为用户，我希望看到挑战排行榜，以便了解其他用户的表现并获得激励。

#### 验收标准

1. THE System SHALL 显示当前周期所有参与用户的完成进度
2. THE System SHALL 按完成天数和完成时间排序用户
3. THE System SHALL 显示用户的排名、昵称、完成天数
4. THE System SHALL 保护用户隐私，仅显示昵称和头像
5. THE System SHALL 实时更新排行榜数据

### 需求 13: 奖励提现

**用户故事**: 作为用户，我希望提现我的奖励，以便获得实际收益。

#### 验收标准

1. THE System SHALL 显示用户的可提现余额
2. WHEN 用户申请提现 THEN THE System SHALL 验证余额是否充足
3. WHEN 余额大于或等于 10 元 THEN THE System SHALL 允许提现
4. WHEN 余额小于 10 元 THEN THE System SHALL 拒绝提现请求并提示最低提现金额
5. WHEN 余额充足 THEN THE System SHALL 通过支付渠道处理提现
6. THE System SHALL 支持提现到微信、支付宝或银行卡
7. THE System SHALL 记录所有提现历史，包括金额、手续费、到账时间
8. THE System SHALL 明确显示提现手续费（如有）
9. THE System SHALL 在 1-3 个工作日内完成提现到账

### 需求 14: 饮食朋友圈 - 发布动态

**用户故事**: 作为用户，我希望分享我的饮食记录和成果，以便与朋友交流。

#### 验收标准

1. WHEN 用户选择发布动态 THEN THE System SHALL 允许用户上传照片和文字
2. THE System SHALL 支持用户选择关联的 Meal_Record
3. WHEN 用户发布动态 THEN THE System SHALL 保存到 Social_Feed
4. THE System SHALL 限制照片数量最多 9 张
5. THE System SHALL 限制文字长度最多 500 字
6. THE System SHALL 支持用户删除自己的动态

### 需求 15: 饮食朋友圈 - 互动

**用户故事**: 作为用户，我希望与朋友的动态互动，以便建立轻量社交关系。

#### 验收标准

1. WHEN 用户查看 Social_Feed THEN THE System SHALL 显示关注用户的动态
2. THE System SHALL 支持用户点赞动态
3. THE System SHALL 支持用户评论动态
4. WHEN 用户收到点赞或评论 THEN THE System SHALL 发送通知
5. THE System SHALL 支持用户关注和取消关注其他用户
6. THE System SHALL 按时间倒序显示动态
7. THE System SHALL 支持用户举报违规内容

### 需求 16: 个人中心

**用户故事**: 作为用户，我希望管理我的个人信息和查看我的数据，以便掌控我的账户。

#### 验收标准

1. THE System SHALL 允许用户编辑个人信息（昵称、头像、基础信息）
2. THE System SHALL 显示用户的打卡统计
3. THE System SHALL 显示用户的奖励余额和提现记录
4. THE System SHALL 提供会员中心入口
5. THE System SHALL 提供邀请好友功能
6. THE System SHALL 提供设置选项（通知、隐私、账户）

### 需求 17: PWA 功能

**用户故事**: 作为移动端用户，我希望应用具有原生 APP 的体验，以便更方便地使用。

#### 验收标准

1. THE System SHALL 支持添加到主屏幕
2. THE System SHALL 提供启动画面
3. THE System SHALL 支持离线访问核心功能
4. THE System SHALL 支持推送通知
5. THE System SHALL 适配移动端手势操作
6. THE System SHALL 提供沉浸式状态栏体验

### 需求 18: 支付集成

**用户故事**: 作为用户，我希望能够安全地支付和提现，以便参与挑战和获得奖励。

#### 验收标准

1. THE System SHALL 集成 Stripe 支付（国际用户）
2. THE System SHALL 集成微信支付（国内用户）
3. THE System SHALL 集成支付宝（国内用户）
4. WHEN 支付失败 THEN THE System SHALL 显示错误信息并允许重试
5. THE System SHALL 加密存储支付相关敏感信息
6. THE System SHALL 记录所有支付和提现交易

### 需求 19: 数据持久化与同步

**用户故事**: 作为用户，我希望我的数据能够安全保存并在多设备间同步，以便随时随地访问。

#### 验收标准

1. THE System SHALL 将所有用户数据存储到 Supabase PostgreSQL 数据库
2. WHEN 用户在线时 THEN THE System SHALL 实时同步数据到服务器
3. WHEN 用户离线时 THEN THE System SHALL 将数据缓存到本地
4. WHEN 用户重新联网 THEN THE System SHALL 自动同步本地缓存数据
5. THE System SHALL 处理数据冲突，优先使用最新时间戳的数据
6. THE System SHALL 定期备份用户数据

### 需求 20: 性能与用户体验

**用户故事**: 作为用户，我希望应用响应迅速且流畅，以便获得良好的使用体验。

#### 验收标准

1. THE System SHALL 在 2 秒内完成页面初始加载
2. THE System SHALL 在 500 毫秒内响应用户交互
3. THE System SHALL 使用动画过渡提升用户体验
4. THE System SHALL 优化图片加载，使用懒加载和压缩
5. THE System SHALL 在网络慢速时显示加载状态
6. THE System SHALL 提供错误边界处理，防止应用崩溃

### 需求 21: 防作弊与安全规则

**用户故事**: 作为平台运营方，我希望防止用户作弊，以便维护挑战的公平性和平台的可持续性。

#### 验收标准

1. THE System SHALL 限制同一设备只能参与一个同期 Challenge
2. THE System SHALL 限制同一手机号只能参与一个同期 Challenge
3. THE System SHALL 限制同一支付账户只能参与一个同期 Challenge
4. WHEN 检测到重复上传的照片 THEN THE System SHALL 判定该记录无效
5. WHEN 检测到异常记录模式（如批量添加、时间异常）THEN THE System SHALL 标记为可疑并人工审核
6. WHEN 检测到虚假打卡行为 THEN THE System SHALL 自动判定当日任务无效
7. WHEN 账号被判定为作弊 THEN THE System SHALL 封禁账号且不予返现
8. THE System SHALL 验证支付身份与提现身份必须一致
9. THE System SHALL 记录所有可疑行为日志供审计

### 需求 22: 会员权益体系

**用户故事**: 作为用户，我希望了解免费版和会员版的区别，以便决定是否订阅会员。

#### 验收标准

1. THE System SHALL 提供免费版功能：基础饮食记录、手动添加食物、基础热量统计
2. THE System SHALL 提供会员版功能：无限次 AI 拍照识别、完整图表分析、无广告、挑战优先审核、专属食物库
3. WHEN 免费用户使用 AI 拍照 THEN THE System SHALL 限制每日使用次数为 3 次
4. WHEN 免费用户超过限制 THEN THE System SHALL 提示升级会员
5. THE System SHALL 支持月度订阅和年度订阅
6. THE System SHALL 显示会员权益对比页面
7. WHEN 用户订阅会员 THEN THE System SHALL 立即解锁所有会员功能

### 需求 23: 社交内容审核

**用户故事**: 作为平台运营方，我希望审核用户发布的内容，以便维护社区健康和合规性。

#### 验收标准

1. THE System SHALL 禁止用户发布违法、低俗、广告、导流内容
2. WHEN 用户发布动态 THEN THE System SHALL 使用 AI 进行内容初审
3. WHEN AI 检测到违规内容 THEN THE System SHALL 拒绝发布并提示用户
4. WHEN 用户举报动态 THEN THE System SHALL 将内容加入人工审核队列
5. WHEN 内容被确认违规 THEN THE System SHALL 立即下架该动态
6. WHEN 用户累计违规 3 次 THEN THE System SHALL 封禁该用户账号
7. THE System SHALL 记录所有审核日志
8. THE System SHALL 提供用户申诉渠道

### 需求 24: 系统异常处理与退款

**用户故事**: 作为用户，我希望在系统异常导致挑战失败时能够获得退款，以便保障我的权益。

#### 验收标准

1. WHEN 系统故障导致用户无法提交记录 THEN THE System SHALL 记录故障时间段
2. WHEN 系统故障影响用户完成任务 THEN THE System SHALL 自动判定该日任务有效
3. WHEN 系统故障持续超过 2 小时 THEN THE System SHALL 通知所有受影响用户
4. WHEN 用户因系统故障导致挑战失败 THEN THE System SHALL 全额退还 Deposit
5. THE System SHALL 提供用户申诉通道
6. WHEN 用户申诉成功 THEN THE System SHALL 在 3 个工作日内处理退款
