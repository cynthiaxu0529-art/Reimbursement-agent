# 智能费用归属识别 - 设计方案

## 问题背景

CEO (kevin) 所在部门为「CEO线」→ costCenter 为 `ga` → 所有费用被映射到 G&A 科目（6390 等）。
但实际上 kevin 报销的 Alchemy、Anthropic、Cloudflare、Google Cloud 等费用都是**公司研发相关支出**，应归入 R&D 科目（6420 等）。

**核心矛盾**：当前系统按「报销人所在部门」决定费用性质，但实际业务中：
- CEO/管理层经常代付研发相关费用
- 一个人可能同时产生多种性质的费用（差旅是 G&A，但代付的云服务是 R&D）

---

## 设计方案

### 一、报销明细增加「费用归属部门」字段

**数据库变更**：在 `reimbursement_items` 表新增：

```
cost_center_override  text      -- 覆盖归属：'rd' | 'sm' | 'ga' | null
on_behalf_of_dept_id  uuid      -- 代报销的目标部门 ID（可选）
```

**逻辑**：
- `cost_center_override` 优先级最高 → 直接决定费用性质
- `on_behalf_of_dept_id` 次之 → 用目标部门的 costCenter
- 都为空时 → 回退到报销人所在部门（现有逻辑）

---

### 二、智能提示（提交时自动检测）

**新增 API**：`POST /api/internal/check-expense-attribution`

**触发时机**：报销单创建/提交时自动检测。

**检测规则**：

```
规则1: 费用类型 vs 部门性质 不匹配
  - 报销人部门 = G&A，但费用类型 = cloud/software/ai_token → 提示 "此费用可能属于 R&D"
  - 报销人部门 = G&A，但 description 包含 Anthropic/OpenAI/Alchemy/Cloudflare/Vercel/Railway 等 → 提示

规则2: 高置信度关键词匹配
  - description 包含已知的 R&D 供应商（Anthropic, OpenAI, AWS, GCP, Alchemy, Vercel, Railway, Cloudflare, Notion）
  - 且报销人不在 R&D 部门 → 强提示

规则3: 历史模式
  - 如果同一供应商的费用，历史上80%都归入 R&D → 提示当前这笔也应该归入 R&D
```

**返回结构**：
```json
{
  "suggestions": [
    {
      "item_index": 0,
      "current_cost_center": "ga",
      "suggested_cost_center": "rd",
      "reason": "Anthropic 是 AI/云服务供应商，通常归入 R&D 费用",
      "confidence": "high",
      "known_vendor": true
    }
  ]
}
```

---

### 三、Web UI 提示流程

**在报销创建/编辑页面**：

1. 用户添加费用明细后，前端自动调用检测 API
2. 如果有建议，在对应明细行下方显示提示条：

```
⚠️ 此费用 (Anthropic, PBC) 通常属于研发费用，当前将归入 G&A。
   [改为 R&D 费用]  [保持 G&A]  [代其他部门报销 ▼]
```

3. 点击 **[改为 R&D 费用]** → 设置 `cost_center_override = 'rd'`
4. 点击 **[代其他部门报销]** → 弹出部门选择器 → 设置 `on_behalf_of_dept_id`
5. 点击 **[保持 G&A]** → 标记为已确认，不再提示

---

### 四、OpenClaw Agent 提示流程

**修改 SKILL.md**，在创建报销的典型流程中增加：

```markdown
### 费用归属智能检测

创建报销时，如果检测到费用可能不属于报销人所在部门，系统会在响应中返回 `attribution_suggestions`。
Agent 应该将这些建议展示给用户并询问：

"检测到您报销的 Anthropic $100 费用通常属于研发(R&D)费用，
但您在 CEO线 部门，默认会归入管理费用(G&A)。
请问这笔费用是否属于研发支出？如果是，我帮您标记为 R&D 费用。"
```

**API 变更**：在 `POST /api/reimbursements` 的响应中增加 `attribution_suggestions` 字段。

Agent 收到建议后：
1. 在 Telegram 对话中提示用户
2. 用户确认后，Agent 调用 `PATCH /api/reimbursements/{id}/items/{itemId}` 更新 `costCenterOverride`

---

### 五、已入账数据的批量修正（已完成）

上一轮已实现：
- 明细追溯 tab：按员工/科目筛选 → 全选 → 批量修改科目

---

## 实施步骤

### Phase 1: 数据库 + 映射逻辑（本次实现）
1. 新增 `cost_center_override` 和 `on_behalf_of_dept_id` 字段
2. 修改 `mapExpenseToAccount()` 使用新字段
3. 新增检测 API `check-expense-attribution`

### Phase 2: Web UI 提示（本次实现）
4. 报销创建/编辑页面增加归属提示
5. 支持一键修改费用性质

### Phase 3: Agent 提示（本次实现）
6. 修改 `POST /api/reimbursements` 响应，包含归属建议
7. 更新 SKILL.md 文档，指导 Agent 处理归属建议
8. 新增 `PATCH /api/reimbursements/{id}/items/{itemId}` 支持 `costCenterOverride` 字段

---

## 已知的 R&D 供应商清单（初始）

```
Anthropic, OpenAI, Alchemy, Cloudflare, Vercel, Railway,
Google Cloud, AWS, Azure, Notion, GitHub, GitLab,
Cursor, ChatGPT, Claude, Figma, Linear, Supabase,
RapidAPI, OpenRouter, InfiniteTalk, ListenHub
```

这个清单可后续在管理后台维护。
