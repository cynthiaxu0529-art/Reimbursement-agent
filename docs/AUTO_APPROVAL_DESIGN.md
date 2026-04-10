# 自动审批 & 自动付款系统设计文档

> 版本：1.0  
> 确认日期：2026-04-09  
> 状态：**已定稿，进入开发**

---

## 一、背景与目标

### 问题
人工审批链路慢，小额、合规的报销单需要等待审批人手动操作，造成流程积压。

### 目标
- 审批人通过 AI 对话（OpenClaw/Chat）配置自己的自动审批偏好，无需写代码
- 定时任务自动评估待审批项，符合条件的自动通过
- 财务配置付款条件，审批完成后自动发起 Fluxa 打款
- 全程留有完整审计轨迹，自动操作随时可查、可撤销

---

## 二、已确认设计决策

| 参数 | 值 | 说明 |
|------|----|------|
| 单笔自动审批上限 | **$500 USD** | 超出必须人工 |
| 单日自动审批总额上限 | **$2,000 USD** | 同一审批人当日累计 |
| 缓冲撤销期 | **1 小时** | 自动审批生效前的可取消窗口 |
| 调度频率 | **每 15 分钟** | Vercel Cron 触发 |
| 新员工保护期 | **入职 < 90 天** | 永远走人工审批 |
| 自我审批 | **绝对禁止** | 报销人 = 审批人时跳过自动审批 |
| 顶层审批人 | **允许自动批** | 链路中无上级时，审批人可配置自动审批 |
| 异常检测 | **不启用** | AI agent 可能在深夜提交，不以提交时间判断异常 |
| Phase 1 范围 | Memory 规则 + 自动付款 | Heart(AI 判断) 延至 Phase 2 |

---

## 三、系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   配置阶段（Chat 对话）                    │
│                                                         │
│  审批人 ──→ AI Chat ──→ 解析意图 ──→ 存入 DB              │
│                            ├─ autoApprovalProfiles      │
│                            └─ autoApprovalRules         │
│                                                         │
│  财务 ──→ AI Chat ──→ 解析意图 ──→ autoPaymentProfiles    │
└─────────────────────────────────────────────────────────┘
                          │
                   每 15 分钟
                          │
┌─────────────────────────▼───────────────────────────────┐
│          执行阶段：/api/cron/auto-approval                │
│                                                         │
│  查询所有待审批 approvalChain 步骤                         │
│          ↓                                              │
│  ┌───────────────────────────────┐                      │
│  │       Risk Checker（硬规则）   │ → 不通过 → skip       │
│  │  · 金额 ≤ $500                │                      │
│  │  · 报销人 ≠ 审批人             │                      │
│  │  · 员工在职 ≥ 90天            │                      │
│  │  · policy_compliance = passed │                      │
│  │  · dedup 通过                │                      │
│  │  · 单日累计 ≤ $2000           │                      │
│  └──────────────┬────────────────┘                      │
│                 ↓ 通过                                   │
│  ┌───────────────────────────────┐                      │
│  │   Memory Evaluator（规则匹配） │ → 不命中 → skip       │
│  │  查找该审批人的 autoApprovalRules│                     │
│  │  按 priority 排序，逐条匹配    │                      │
│  └──────────────┬────────────────┘                      │
│                 ↓ 命中                                   │
│  写入 autoApprovalLogs（decision=queued）                 │
│  等待 cancelWindowEndsAt（1小时后）                       │
│          ↓                                              │
│  /api/cron/auto-approval 再次执行时                       │
│  检查 queued 记录是否超过缓冲期 → 执行自动审批              │
│  更新 approvalChain.status = 'approved'                  │
│  发通知（Email + Telegram）                               │
└─────────────────────────────────────────────────────────┘
                          │
              全部审批步骤完成
                          │
┌─────────────────────────▼───────────────────────────────┐
│          付款阶段：/api/cron/auto-payment                 │
│                                                         │
│  检查 autoPaymentProfiles 条件                           │
│  满足 → 等待 minHoursAfterFinalApproval（默认24h）         │
│  → 自动调用 Fluxa Payout                                 │
│  → 写 payments 记录 + 审计日志 + 通知财务                  │
└─────────────────────────────────────────────────────────┘
```

---

## 四、数据模型

### 4.1 autoApprovalProfiles（审批人配置）

```typescript
{
  id: uuid PK
  tenantId: uuid FK→tenants
  userId: uuid FK→users          // 审批人（非报销人）
  isEnabled: boolean             // 总开关
  maxAmountCap: decimal          // 个人上限（≤ 系统上限 $500）
  cancellationWindowMinutes: integer  // 缓冲期，默认60分钟
  dailyApprovalLimitUSD: decimal      // 单日累计上限，默认$2000
  expiresAt: timestamp           // 规则到期时间（最长6个月）
  createdViaChat: boolean        // 是否通过对话创建
  lastTriggeredAt: timestamp     // 上次触发时间
  createdAt, updatedAt
}
```

### 4.2 autoApprovalRules（Memory 规则）

```typescript
{
  id: uuid PK
  profileId: uuid FK→autoApprovalProfiles
  priority: integer              // 优先级（越小越先）
  name: text                     // 规则名称（给审批人看）
  conditions: jsonb {
    maxAmount?: number           // 金额上限（不超过 profile 上限）
    allowedCategories?: string[] // 允许的报销类别
    blockedCategories?: string[] // 拒绝的报销类别
    allowedEmployeeIds?: string[]// 特定员工白名单
    requirePolicyPassed: boolean // 默认 true
    requireReceiptsAttached: boolean // 默认 true
    allowedDepartmentIds?: string[]  // 允许的部门
  }
  action: 'approve' | 'skip'    // 命中后动作
  isActive: boolean
  createdAt, updatedAt
}
```

### 4.3 autoApprovalLogs（决策审计）

```typescript
{
  id: uuid PK
  tenantId: uuid FK→tenants
  reimbursementId: uuid FK→reimbursements
  approvalChainStepId: uuid FK→approvalChain
  approverId: uuid FK→users
  profileId: uuid FK→autoApprovalProfiles

  decision: 'queued' | 'executed' | 'cancelled' | 'skipped'
  skipReason?: text              // 跳过原因（风控/规则不命中）
  riskChecksPassed: jsonb        // 各项风控结果详情
  ruleMatched?: text             // 命中的规则名称

  cancelWindowEndsAt: timestamp  // 缓冲期截止时间
  cancelledByUserId?: uuid       // 撤销人（审批人手动取消）
  cancelledAt?: timestamp
  executedAt?: timestamp         // 最终执行时间

  createdAt
}
```

### 4.4 autoPaymentProfiles（财务付款配置）

```typescript
{
  id: uuid PK
  tenantId: uuid FK→tenants
  createdByUserId: uuid FK→users   // 配置人（财务/管理员）
  isEnabled: boolean
  conditions: jsonb {
    maxAmountPerReimbursementUSD: number  // 单笔上限（建议≤$200）
    maxDailyTotalUSD: number              // 单日总额上限
    minHoursAfterFinalApproval: number    // 最短等待时间，默认24
    requirePolicyPassed: boolean          // 默认 true
    employeeMinTenureDays: number         // 员工最短在职天数，默认90
    allowedDepartmentIds?: string[]       // 允许的部门
    blockedCategories?: string[]          // 禁止的类别
  }
  emergencyPause: boolean          // 紧急暂停开关
  expiresAt: timestamp
  createdAt, updatedAt
}
```

---

## 五、风险控制体系

### 5.1 硬规则（代码强制，不可配置绕过）

| 规则 | 检查逻辑 | 失败处理 |
|------|---------|---------|
| 金额上限 | `totalAmountInBaseCurrency <= 500` | skip，记录原因 |
| 禁止自我审批 | `reimbursement.userId !== approvalStep.approverId` | skip |
| 新员工保护 | `user.createdAt + 90天 <= now()` | skip |
| 政策合规 | `reimbursement.complianceStatus === 'passed'` | skip |
| 单日累计上限 | 当日已自动批总额 + 本单 ≤ $2000 | skip |
| 付款钱包绑定 | 员工已绑定有效钱包地址 | 付款阶段跳过 |

### 5.2 通知规则（强制，不可关闭）

每次自动审批执行后，**必须**通知审批人：
- Email：含报销单摘要、金额、报销人、审批时间
- Telegram（如已绑定）：简短通知 + 链接

### 5.3 缓冲期机制

```
审批条件满足
      ↓
写 autoApprovalLogs(decision='queued', cancelWindowEndsAt=now+60min)
      ↓
[15分钟后 Cron 再次运行]
      ↓
检查 queued 记录：
  - cancelWindowEndsAt > now → 继续等待
  - cancelWindowEndsAt ≤ now AND cancelledAt IS NULL → 执行审批
  - cancelledAt IS NOT NULL → 跳过（用户已取消）
```

### 5.4 自动付款额外控制

- 金额建议 ≤ $200（财务可配置，最大不超过 $500）
- 最短等待 24 小时（最终审批通过后计时）
- 紧急暂停：`autoPaymentProfiles.emergencyPause = true` 即停所有自动付款
- 每日总额限制，超出后自动降级为人工

---

## 六、Chat 配置交互

### 审批人设置（Memory 规则）

```
用户：帮我设置自动审批，我们团队的报销只要不超过500美金、
     有票据、合规就自动批

AI：好的，我来帮你配置。确认以下内容：
   ✅ 金额：≤ $500 USD（系统最大限制）
   ✅ 要求：票据完整 + 合规检查通过
   ✅ 缓冲期：生效前1小时内你可以取消
   ✅ 单日上限：$2,000 USD
   ✅ 有效期：6个月后自动过期
   ⚠️ 注意：新入职90天内员工的报销仍需人工审批
   
   确认保存吗？
```

### 财务设置付款条件

```
财务：设置自动打款，报销金额不超过200美金的自动打

AI：好的，自动付款配置：
   ✅ 单笔上限：$200 USD
   ✅ 最终审批通过后等待：24小时
   ✅ 员工钱包地址已绑定才执行
   ✅ 单日自动打款上限：$1,000 USD
   ✅ 员工在职满90天才自动打
   
   紧急情况你可以随时一键暂停所有自动付款。确认吗？
```

---

## 七、Phase 规划

| Phase | 内容 | 状态 |
|-------|------|------|
| **Phase 1**（当前） | Memory 规则引擎 + 硬规则风控 + 缓冲期 + 自动付款 + 审计日志 + 通知 | 🚀 开发中 |
| Phase 2 | Heart 模式（AI 判断）+ 管理员统计视图 | 📋 待排期 |

### Phase 2 Heart 模式说明
- 审批人用自然语言描述偏好，AI（Claude Haiku，约 $0.8/1M tokens）代为判断
- 仅在 Memory 规则无法匹配时触发
- 判断结果仍经过所有硬规则预检
- Phase 1 稳定后再开放

---

## 八、API 接口设计

### 审批配置
```
GET    /api/auto-approval/profile          获取当前用户的配置
POST   /api/auto-approval/profile          创建/更新配置
DELETE /api/auto-approval/profile          停用配置

POST   /api/auto-approval/rules            创建规则
PUT    /api/auto-approval/rules/:id        更新规则
DELETE /api/auto-approval/rules/:id        删除规则

GET    /api/auto-approval/logs             查询决策日志
POST   /api/auto-approval/cancel/:logId    缓冲期内取消自动审批
```

### 付款配置
```
GET    /api/auto-payment/profile           获取付款配置
POST   /api/auto-payment/profile           创建/更新
POST   /api/auto-payment/pause             紧急暂停
POST   /api/auto-payment/resume            恢复
```

### Cron 端点（CRON_SECRET 保护）
```
POST   /api/cron/auto-approval             每15分钟执行
POST   /api/cron/auto-payment              每15分钟执行
```

---

## 九、目录结构

```
src/
├── lib/
│   ├── auto-approval/
│   │   ├── risk-checker.ts          # 硬规则风控预检
│   │   ├── memory-evaluator.ts      # Memory 规则匹配
│   │   └── auto-approval-engine.ts  # 主引擎（调度 risk + memory）
│   └── auto-payment/
│       └── auto-payment-engine.ts   # 自动付款引擎
├── app/api/
│   ├── auto-approval/
│   │   ├── profile/route.ts         # 配置 CRUD
│   │   ├── rules/route.ts           # 规则 CRUD
│   │   ├── logs/route.ts            # 决策日志
│   │   └── cancel/[logId]/route.ts  # 缓冲期取消
│   ├── auto-payment/
│   │   ├── profile/route.ts
│   │   ├── pause/route.ts
│   │   └── resume/route.ts
│   └── cron/
│       ├── auto-approval/route.ts   # Cron 触发入口
│       └── auto-payment/route.ts
```

---

## 十、风险总结

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 审批人设置过于宽松 | 中 | 硬规则兜底（$500上限、合规必须通过） |
| 钱包地址被篡改 | 高 | 付款前验证地址格式 + 员工提前绑定（非临时填写） |
| 规则永久生效 | 中 | 6个月强制过期 |
| 自动付款金额错误 | 中 | 单笔上限 + 24h 等待 + 每日总额限制 |
| 审计不透明 | 低 | 全程 autoApprovalLogs 记录，包含每项风控结果 |
| AI Agent 深夜大量提交 | 低 | 无异常时间检测，但单日 $2000 上限控制总风险敞口 |
