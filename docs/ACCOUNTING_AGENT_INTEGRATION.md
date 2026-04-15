# Accounting Agent Integration

契约文档：accounting agent 从报销系统拉取半月记账汇总、过账到外部总账（JE）后回写同步状态的完整接口说明。

> 相关代码：
> - `src/app/api/reimbursement-summaries/route.ts` — 汇总拉取
> - `src/app/api/reimbursement-summaries/mark-synced/route.ts` — 回写同步状态
> - `src/lib/db/schema.ts` — `reimbursementItems` / `correctionApplications` 的 `synced_je_id` 字段
> - `drizzle/0011_add_coa_change_tracking.sql` + `drizzle/0012_add_correction_sync_tracking.sql`
> - `src/app/api/payments/process/route.ts` — 付款时自动抵扣冲差，写入 `correction_applications`
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

#### 冲差落库的两条路径

`correction_applications` 表由以下两种方式插入，对 accounting agent 完全透明——都产生同样的 1220 明细：

1. **付款时自动抵扣（默认路径）**
   - 财务在「付款处理」页点「确认付款」且未传 `customAmount`
   - `POST /api/payments/process` 调用 `calculateAdjustedPaymentAmount()` → 得出建议金额 → Fluxa 按建议金额打款 → 成功后循环 `applyCorrection()` 写入 `correction_applications`
   - `appliedAt` ≈ 付款发起时间
   - 绝大多数冲差应该走这条路径

2. **冲差管理页手工抵扣（例外路径）**
   - 财务在「冲差管理」页打开「应用冲差抵扣」弹窗，指定目标报销单 + 抵扣金额
   - `POST /api/corrections/[id]/apply` 直接调用 `applyCorrection()`
   - `appliedAt` = 手工应用时间
   - 用于付款已经发生、或财务主动分多次抵扣的场景

两条路径写入的记录在字段上完全一致（`applied_by` 都是当前会话用户），accounting agent 不需要区分。

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
- **整单被全额冲差吃掉**：调整后金额 ≤ 0 时付款 API 直接 400，要求财务去冲差管理页手工 apply，不发起 $0 payout。手工 apply 同样写入 `correction_applications`，后续汇总里会出现 1220 明细，但**没有**对应的正费用明细（因为该报销单状态不会推进到 `paid`，不会出现在普通 6xxx 科目里）。

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
