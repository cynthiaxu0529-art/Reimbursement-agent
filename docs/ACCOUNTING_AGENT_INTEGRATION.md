# Accounting Agent Integration

契约文档：accounting agent 从报销系统拉取半月记账汇总、过账到外部总账（JE）后回写同步状态的完整接口说明。

> 相关代码：
> - `src/app/api/reimbursement-summaries/route.ts` — 汇总拉取
> - `src/app/api/reimbursement-summaries/mark-synced/route.ts` — 回写同步状态
> - `src/lib/db/schema.ts` — `reimbursementItems` / `correctionApplications` 的 `synced_je_id` 字段
> - `drizzle/0011_add_coa_change_tracking.sql` + `drizzle/0012_add_correction_sync_tracking.sql`
> - `src/app/api/payments/process/route.ts` — 付款时自动抵扣冲差，写入 `correction_applications`
> - `src/app/api/reimbursements/[id]/settle-with-corrections/route.ts` — 全额抵扣无需打款时的结清端点
> - `src/app/api/corrections/check-adjustment/route.ts` — 打款前预览抵扣（Session 或 API Key 认证）
> - `src/lib/corrections/correction-service.ts` — `calculateAdjustedPaymentAmount` / `applyCorrection` 核心逻辑

## 认证

任选其一：

| 方式 | Header | 要求 |
|------|--------|------|
| Service Account | `X-Service-Key: <key>` | 权限 `read:reimbursement_summaries` / `write:reimbursement_summaries` |
| API Key | `Authorization: Bearer rk_...` | scope `accounting_summary:read` / `accounting_summary:write` |

## 1. 拉取汇总

`GET /api/reimbursement-summaries[?since=<ISO>]`

按「半月周期 × 会计科目」GROUP BY 已审批/已付款报销 + 已应用冲差，返回可入账明细。`since` 可选，按 `period_end` 增量过滤。

**响应结构**

```json
{
  "summaries": [
    {
      "summary_id": "REIMB-SUM-202604-A",
      "period_start": "2026-04-01",
      "period_end": "2026-04-15",
      "currency": "USD",
      "total_amount": 1580.00,
      "total_records": 7,
      "items": [
        {
          "account_code": "6602",
          "account_name": "差旅费",
          "total_amount": 1480.00,
          "record_count": 6,
          "details": [
            {
              "item_id": "uuid-of-reimbursement_item",
              "reimbursement_id": "uuid",
              "employee_name": "张三",
              "amount": 120.00,
              "description": "打车",
              "category": "transportation",
              "item_type": "reimbursement_item",
              "synced_je_id": null
            }
          ]
        },
        {
          "account_code": "1220",
          "account_name": "费用冲差调整（多付扣回）",
          "total_amount": -20.00,
          "record_count": 1,
          "details": [
            {
              "item_id": "uuid-of-correction_application",
              "reimbursement_id": "原报销 uuid",
              "employee_name": "张三",
              "amount": -20.00,
              "description": "冲差调整: 多付了 20",
              "category": "correction_adjustment",
              "item_type": "correction_application",
              "synced_je_id": null
            }
          ]
        }
      ]
    }
  ],
  "coa_changes": [
    {
      "item_id": "uuid",
      "reimbursement_id": "uuid",
      "previous_account_code": "6602",
      "current_account_code": "6603",
      "current_account_name": "业务招待费",
      "changed_at": "2026-04-10T08:00:00.000Z",
      "synced_je_id": "JE-99"
    }
  ]
}
```

### 字段关键点

| 字段 | 语义 | 幂等处理 |
|------|------|----------|
| `item_type` | `reimbursement_item`（默认，缺省时等价）或 `correction_application` | 决定 mark-synced 时 `item_type` 的值 |
| `synced_je_id` | 已过账的外部 JE 编号；未过账时为 `null`/缺省 | 非空即跳过，不要重复发 JE |
| `coa_changes[]` | 科目变更通知，原 JE 需要 UPDATE 而不是新建 | 按 `previous_account_code` 在外部系统找到旧 JE 更新 |

### 冲差调整（account_code = `1220`）

- 原报销 item 已在原期间入账后才应用的冲差，会作为**应用时间所在半月期间**的一条独立 1220 明细出现。
- 金额正负表示方向：
  - `amount < 0` → 多付扣回（科目名「多付扣回」）
  - `amount > 0` → 少付补付（科目名「少付补付」）
- 原报销的 JE **不动**，差额通过 1220 当期调整分录补平。会计政策上这是「本期调整」派的标准做法，不做跨期反转。
- `item_id` 是 `correction_applications.id`（**不是**报销明细 id），mark-synced 必须带 `item_type: "correction_application"`。

#### 冲差落库的三条路径

`correction_applications` 表由以下三种方式插入，对 accounting agent 完全透明——都产生同样的 1220 明细：

1. **付款时自动抵扣（默认路径，最常见）**
   - 财务在「付款处理」页点「确认付款」且未传 `customAmount`
   - `POST /api/payments/process` 调用 `calculateAdjustedPaymentAmount()` → 得出建议金额 → Fluxa 按建议金额打款 → 成功后循环 `applyCorrection()` 写入 `correction_applications`
   - `appliedAt` ≈ 付款发起时间
   - 绝大多数冲差走这条路径

2. **全额抵扣结清（无需打款）**
   - 当抵扣后 `adjustedAmount <= 0`（整单都被冲差吃掉）时，Fluxa 不能发 $0 payout，财务点「抵扣结清」按钮
   - 前端调 `POST /api/reimbursements/[id]/settle-with-corrections`
   - 端点循环 `applyCorrection()` + 写入一条 `amount=0 / paymentProvider='internal_offset'` 的 payment 占位记录 + 把报销状态从 `approved` 推到 `paid`
   - 也可以由 `/api/payments/process` 主动引导：当检测到 `adjustedAmount <= 0` 时，响应 `{ success: false, code: 'FULL_OFFSET_REQUIRED', settleEndpoint: '...' }`，前端/agent 据此跳到 settle 端点

3. **冲差管理页手工抵扣（例外路径）**
   - 财务在「冲差管理」页打开「应用冲差抵扣」弹窗，指定目标报销单 + 抵扣金额
   - `POST /api/corrections/[id]/apply` 直接调用 `applyCorrection()`
   - `appliedAt` = 手工应用时间
   - 用于付款已经发生、财务分多次抵扣、或任何需要精细控制金额的场景
   - 从付款页跳转时，URL 会带 `?applyCorrection=<cid>&targetReimbId=<rid>&suggestedAmount=<n>`，弹窗会**自动预填**这三个字段，财务一键确认即可

三条路径写入的记录在字段上完全一致（`applied_by` 都是当前会话用户），accounting agent 不需要区分。

#### 全额抵扣结清在汇总里的形状

路径 2（结清）产生的数据在下次拉取汇总时：

- 新报销的**费用明细**（6xxx 科目）按 `reimbursement.status = 'paid'` 被纳入汇总，按原始金额入账
- 1220 冲差调整行按应用期间被单独列出（等额反向冲抵）
- **没有**对应的正常 payment 记录（那条 `internal_offset` 不是转账、没有 `payoutId`），但 `/api/payments/stats` 等按 reimbursement 状态统计的接口不受影响
- accounting agent 看到：费用入账 + 1220 反向调整 = 净现金流 0，与实际相符

### Agent 调用指南

accounting 场景下 agent 的推荐调用序列：

| 场景 | 调用顺序 |
|------|---------|
| 标准付款（待冲差金额 < 报销金额） | ① `GET /api/corrections/check-adjustment?reimbursementId=X` 预览（可选）→ ② `POST /api/payments/process`（不传 `customAmount`）→ API 自动抵扣 + 记账 |
| 整单全额被冲差抵扣 | ① `GET /api/corrections/check-adjustment` 发现 `adjustedAmount <= 0` → ② `POST /api/reimbursements/[id]/settle-with-corrections` 一键结清（或直接调 `/api/payments/process` 得到 `FULL_OFFSET_REQUIRED` 错误后跳转到 settle） |
| 财务要求只抵一部分 | ① `GET /api/corrections/check-adjustment` 预览 → ② `POST /api/corrections/[id]/apply` 指定金额抵扣 → ③ `POST /api/payments/process` 带 `customAmount = 原 - 已抵`（显式传 customAmount 后系统不会再次自动抵扣） |

所有端点都支持 API Key 认证（`Authorization: Bearer rk_*`），需要的 scope：

| 端点 | scope |
|------|-------|
| `GET /api/corrections/check-adjustment` | `payment:read` |
| `POST /api/payments/process` | `payment:process` |
| `POST /api/reimbursements/[id]/settle-with-corrections` | `payment:process` |
| `POST /api/corrections/[id]/apply` | （目前 session only，后续可加 API Key） |

### 「付款已自动抵扣」场景的含义

如果 accounting agent 看到：
- 某个半月期间有报销明细 A（科目 6602，金额 100）
- 同一/后续期间有 1220 调整明细 B（金额 -20，`reimbursement_id` 指回某个**已付款**的老报销）

通常说明：当前期间对应员工的一笔新报销在付款时自动扣减了 $20 去抵以前的多付，所以：
- 报销 A 的费用科目 JE 仍按**审批金额** 100 记（`detail.amount = 100`，不因为自动抵扣而缩水）
- 1220 调整 JE 按 -20 单独记，抵减原多付的应付账款
- 实际 Fluxa 打款金额 = 100 - 20 = 80（这是现金账视角，与 JE 无关）

这样费用科目归集不受冲差影响，追溯原始费用时金额仍然正确。

## 2. 回写同步状态

`POST /api/reimbursement-summaries/mark-synced`

过账成功后调用，写入 `synced_je_id` 防止下次重复过账。

**请求**

```json
{
  "items": [
    {
      "item_id": "uuid-of-reimbursement_item",
      "je_id": "JE-101",
      "item_type": "reimbursement_item"
    },
    {
      "item_id": "uuid-of-correction_application",
      "je_id": "JE-102",
      "item_type": "correction_application"
    }
  ]
}
```

`item_type` 可选，缺省为 `reimbursement_item`（向后兼容老 agent）。若指定 `correction_application`，会写入 `correction_applications` 表而不是 `reimbursement_items`。

**响应**

```json
{
  "success": true,
  "synced_count": 2,
  "items": [
    { "item_id": "...", "item_type": "reimbursement_item", "synced_je_id": "JE-101", "synced_at": "2026-04-15T10:00:00.000Z" },
    { "item_id": "...", "item_type": "correction_application", "synced_je_id": "JE-102", "synced_at": "2026-04-15T10:00:00.000Z" }
  ]
}
```

**错误**

| 状态码 | 情况 |
|--------|------|
| 400 | 缺少 `item_id`/`je_id`，或 `item_type` 非法 |
| 404 | 任一 `item_id` 在对应表中不存在（按 `item_type` 分表验证） |

## 3. 推荐拉取循环

```
拉取 summaries
for each summary:
  for each item_group:
    for each detail:
      if detail.synced_je_id:
        if detail.previous_account_code:
          → UPDATE existing JE to new account_code
        else:
          → skip（已过账）
      else:
        → CREATE JE（按 item_type 走不同的分录模板）
        → collect (item_id, je_id, item_type)
批量 POST mark-synced
```

## 4. 边界情况

- **表不存在**：`correction_applications` 迁移未跑时，拉取接口内部用 try/catch 兜底，不返回冲差明细，不影响主汇总。
- **冲差跨期**：1220 明细永远按 `applied_at` 归期，与原报销的 `approved_at` 不对齐；这是设计行为。
- **冲差被取消**：目前取消冲差（correction `status = cancelled`）不回滚 application，已应用的 application 会继续出现在汇总里——如遇此类需求需在 `expense_corrections` 表加状态过滤。
- **付款时 applyCorrection 部分失败**：付款 API 先调 Fluxa、再循环 `applyCorrection`。单条冲差写入失败时不回滚（Fluxa 已接单），失败信息写到 `reimbursements.aiSuggestions.appliedCorrections[].ok = false`。accounting agent 不会看到这条失败的 application（因为没入库），下一次汇总拉取自然也不会包含它；需要人工去冲差管理页补 apply。
- **整单被全额冲差吃掉**：调整后金额 ≤ 0 时付款 API 返回 `code: 'FULL_OFFSET_REQUIRED'`，前端/agent 应转用 `POST /api/reimbursements/[id]/settle-with-corrections` 完成无打款结清。结清成功后报销状态直接 `approved → paid`，同时写入 `amount=0 / paymentProvider='internal_offset'` 的占位 payment 记录。此时汇总里会同时看到费用明细 + 1220 反向调整（两者等额抵消），这是正确的：费用归集照常，$0 现金流。
- **settle-with-corrections 中途失败**：端点顺序调 `applyCorrection`，任一条失败立即中止并返回 500，**不会**推进 reimbursement 状态——避免半推进半失败。已成功的 application 已入库可保留（幂等无副作用）；重新调用 settle 端点时会重新查 `calculateAdjustedPaymentAmount`，只处理剩余未抵的冲差。

## 5. 上线 / Rollout Checklist

这次改动需要配合两步操作才能生效：

### 数据库迁移（必做）

在目标环境跑一次：

```sql
-- drizzle/0012_add_correction_sync_tracking.sql
ALTER TABLE "correction_applications" ADD COLUMN IF NOT EXISTS "synced_je_id" text;
ALTER TABLE "correction_applications" ADD COLUMN IF NOT EXISTS "synced_at" timestamp;
```

幂等 (`IF NOT EXISTS`)，重复执行安全。迁移未跑时代码层有 try/catch 兜底，冲差明细不会出现在汇总里，主流程不受影响；只有迁移跑完才能真正幂等处理 1220 调整。

### Accounting Agent 升级

agent 端按两点调整即可（都是非破坏性增量）：

1. **拉汇总时识别 `item_type`**
   - 老逻辑默认所有 detail 都是 `reimbursement_item`，仍然兼容。
   - 新逻辑：遇到 `item_type === 'correction_application'` 时，走冲差调整 JE 模板（科目 1220，按金额正负决定借贷方向）。

2. **回调 `mark-synced` 时带上 `item_type`**
   - 老请求体（无 `item_type`）默认写入 `reimbursement_items` 表，继续有效。
   - 新请求体：为冲差那条 detail 传 `item_type: "correction_application"`，系统会写入 `correction_applications.synced_je_id`。

不升级 agent 的后果：冲差调整**不会被过账**（因为 agent 看不懂 1220 那条），但不会产生重复 JE 或数据污染——最多就是财务需要手工补一条调整分录。
