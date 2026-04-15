# Accounting Agent Integration

契约文档：accounting agent 从报销系统拉取半月记账汇总、过账到外部总账（JE）后回写同步状态的完整接口说明。

> 相关代码：
> - `src/app/api/reimbursement-summaries/route.ts` — 汇总拉取
> - `src/app/api/reimbursement-summaries/mark-synced/route.ts` — 回写同步状态
> - `src/lib/db/schema.ts` — `reimbursementItems` / `correctionApplications` 的 `synced_je_id` 字段
> - `drizzle/0011_add_coa_change_tracking.sql` + `drizzle/0012_add_correction_sync_tracking.sql`

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
