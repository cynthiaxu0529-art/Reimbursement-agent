/**
 * 公开的 OpenClaw Skill 端点
 *
 * GET /api/openclaw/skill - 返回 SKILL.md 内容（无需认证）
 *
 * 这个端点是公开的，OpenClaw agent 可以直接抓取来了解如何调用报销系统 API。
 * 不包含任何敏感信息（API Key、内部架构等），只有 API 使用说明。
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Skill 元数据（JSON 格式，方便程序解析） */
const SKILL_META = {
  name: 'reimbursement',
  version: '1.2.0',
  description: '企业报销管理 - 帮助用户规划差旅行程、记录行程单、提交报销、上传发票、查询报销状态、查看政策和分析费用',
  requires: {
    env: ['REIMBURSEMENT_API_KEY', 'REIMBURSEMENT_API_URL'],
  },
  setup_url: '/dashboard/settings/api-keys',
  docs_url: '/api/openclaw/skill',
};

/** 动态生成 SKILL.md，把当前服务的真实 URL 嵌入 */
function generateSkillMarkdown(baseUrl: string): string {
  return `---
name: reimbursement
description: 企业报销管理 - 帮助用户提交报销、上传发票、查询报销状态、查看政策和分析费用
metadata:
  openclaw:
    requires:
      env:
        - REIMBURSEMENT_API_KEY
        - REIMBURSEMENT_API_URL
---

# 报销管理技能

你可以帮助用户管理企业报销流程。通过以下 API 操作，你可以代替用户完成报销的全流程。

## 环境配置

使用此技能前，必须配置以下两个环境变量，缺一不可：

| 变量名 | 必填 | 说明 | 示例 |
|--------|------|------|------|
| \`REIMBURSEMENT_API_KEY\` | ✅ | API 认证密钥，以 \`rk_\` 开头 | \`rk_abc123...\` |
| \`REIMBURSEMENT_API_URL\` | ✅ | 报销服务的完整基础 URL（不带末尾斜杠） | \`${baseUrl}\` |

**常见错误**：只配置了 \`REIMBURSEMENT_API_KEY\` 而没有配置 \`REIMBURSEMENT_API_URL\`，会导致所有 API 请求失败（地址为空）。请确保两个变量都已正确设置。

获取方式：登录报销系统后台，点击侧栏 **API Keys** 页面创建密钥，同时记下系统的访问地址作为 \`REIMBURSEMENT_API_URL\`。

## 认证

所有 API 请求必须在 Header 中携带：
\`\`\`
Authorization: Bearer {REIMBURSEMENT_API_KEY}
\`\`\`

API 基础地址：\`{REIMBURSEMENT_API_URL}\`（当前服务地址：${baseUrl}）

## 重要安全规则

1. **创建报销前必须确认**：在提交报销单之前，先向用户展示报销明细摘要并请求确认
2. **金额核实**：如果用户提供的票据金额与口述金额不一致，主动提醒
3. **政策合规**：提交前先查询政策确认是否超限
4. **不要猜测**：如果用户没有提供必要信息（金额、类别、日期），请追问而不是猜测

## 报销单状态流转

报销单有以下状态，只能按箭头方向流转：

\`\`\`
draft（草稿）
  ↓ 提交
pending（待审批）
  ↓ 审批人审核          ↘ 驳回
under_review（审核中）   rejected（已驳回）→ draft（可撤回为草稿重新编辑）
  ↓ 通过                                   → pending（可直接重新提交）
approved（已批准）
  ↓ 发起打款
processing（处理中）
  ↓ 打款成功
paid（已支付）
\`\`\`

**各状态允许的操作：**

| 当前状态 | 可流转到 | 操作方式 |
|----------|----------|----------|
| \`draft\` | \`pending\` | PUT 更新时设 \`status: "pending"\` |
| \`pending\` | \`draft\` | PUT 更新时设 \`status: "draft"\`（撤回） |
| \`pending\` | \`approved\` / \`rejected\` / \`under_review\` | PATCH 审批操作 |
| \`under_review\` | \`approved\` / \`rejected\` | PATCH 审批操作 |
| \`rejected\` | \`draft\` / \`pending\` | PUT 更新时设新 status（重新编辑或提交） |
| \`approved\` | \`processing\` | 系统自动发起支付 |

**可删除的状态**：仅 \`draft\` 和 \`rejected\` 状态的报销单可以删除。

## 登录后初始化

认证成功后，在执行任何报销操作之前，必须先获取当前公司的费用类别配置：

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/settings/categories
\`\`\`

返回示例：
\`\`\`json
{
  "success": true,
  "data": {
    "categories": [
      { "value": "flight", "label": "机票", "labelEn": "Flight", "icon": "✈️" },
      { "value": "train", "label": "火车票", "labelEn": "Train", "icon": "🚄" },
      { "value": "hotel", "label": "酒店住宿", "labelEn": "Hotel", "icon": "🏨" }
    ]
  }
}
\`\`\`

**注意**：不同公司的费用类别不同，创建报销时 \`category\` 字段的值必须来自此接口返回的 \`value\` 列表。不要使用硬编码的类别值。

## 可用操作

### 1. 查看报销单列表

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/reimbursements
\`\`\`

查询参数：
- \`status\` - 筛选状态：draft, pending, under_review, approved, rejected, processing, paid（支持逗号分隔多选）
- \`page\` - 页码（默认 1）
- \`pageSize\` - 每页数量（默认 50）

示例响应：
\`\`\`json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "2月出差报销",
      "totalAmount": 3500,
      "baseCurrency": "CNY",
      "status": "pending",
      "createdAt": "2026-02-20T10:00:00Z",
      "items": [
        {
          "id": "uuid",
          "category": "flight",
          "description": "上海→北京 机票",
          "amount": 1200,
          "currency": "CNY",
          "date": "2026-02-15",
          "vendor": "东方航空"
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 12,
    "totalPages": 1
  }
}
\`\`\`

### 2. 创建报销单

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/reimbursements
Content-Type: application/json
\`\`\`

请求体：
\`\`\`json
{
  "title": "2月北京出差报销",
  "description": "客户拜访出差费用",
  "status": "draft",
  "items": [
    {
      "category": "flight",
      "description": "上海→北京 机票",
      "amount": 1200,
      "currency": "CNY",
      "date": "2026-02-15",
      "vendor": "东方航空",
      "location": "上海"
    },
    {
      "category": "hotel",
      "description": "北京希尔顿酒店 2晚",
      "amount": 1600,
      "currency": "CNY",
      "date": "2026-02-15",
      "vendor": "希尔顿酒店",
      "location": "北京",
      "checkInDate": "2026-02-15",
      "checkOutDate": "2026-02-17",
      "nights": 2
    },
    {
      "category": "meal",
      "description": "客户午餐",
      "amount": 350,
      "currency": "CNY",
      "date": "2026-02-16",
      "vendor": "全聚德",
      "location": "北京"
    }
  ]
}
\`\`\`

费用类别（category）：使用 \`GET /api/settings/categories\` 返回的 \`value\` 值，不要硬编码。

状态说明：
- \`"status": "draft"\` - 仅保存草稿（推荐，让用户确认后再提交）
- \`"status": "pending"\` - 直接提交审批（需要 \`reimbursement:submit\` scope）

**注意事项：**
- 如果费用超过政策限额，会包含 \`limitAdjustments\` 字段说明调整详情，请告知用户。
- **汇率自动转换**：\`amount\` 和 \`currency\` 是必填项，\`exchangeRate\` 和 \`amountInBaseCurrency\` 可以省略。服务端会自动按照管理员设定的汇率转换为公司记账本位币。
- **OCR 金额保护**：通过 OCR 识别出的发票原始金额应如实填入 \`amount\`，不要修改 OCR 识别的金额。

### 3. 更新报销单

\`\`\`http
PUT {REIMBURSEMENT_API_URL}/api/reimbursements/{id}
Content-Type: application/json
\`\`\`

仅 \`draft\` 或 \`rejected\` 状态可以编辑内容。也用于提交和撤回操作：
- 草稿提交审批：\`{ "status": "pending" }\`
- 撤回已提交的报销：\`{ "status": "draft" }\`
- 驳回后重新提交：\`{ "status": "pending" }\`（会清除驳回信息）

### 4. 删除报销单

\`\`\`http
DELETE {REIMBURSEMENT_API_URL}/api/reimbursements/{id}
\`\`\`

仅 \`draft\` 和 \`rejected\` 状态可以删除。删除后不可恢复。

### 5. 上传票据（推荐 - 自动 OCR + 汇率转换）

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/upload
Content-Type: multipart/form-data
\`\`\`

表单字段：
- \`file\` - 图片文件（支持 jpg, png, webp, gif, pdf，最大 10MB）

Agent 调用时，系统自动完成：上传 → OCR 识别 → 汇率转换。
返回 \`ocr\` 字段包含票面金额、币种、汇率、本位币金额，直接用于创建报销单。

### 6. OCR 识别发票（备用）

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/ocr
Content-Type: application/json
\`\`\`

推荐使用 \`POST /api/upload\`（上传时自动 OCR + 汇率转换）。此端点适用于已有图片 URL 需单独识别的场景。

### 7. 查看报销政策

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/settings/policies
\`\`\`

返回公司报销政策规则，包括各类别的限额。提交报销前建议先查询政策。

### 8. 获取费用类别

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/settings/categories
\`\`\`

返回当前公司可用的费用类别列表。创建报销时 \`category\` 字段的值**必须**来自此接口。

### 9. 查看费用分析

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/analytics/expenses
\`\`\`

查询参数：
- \`period\` - 时间范围：\`month\`（默认）、\`quarter\`、\`year\`、\`custom\`、\`all\`
- \`months\` - 分析月份数（默认 3）
- \`scope\` - 数据范围：\`personal\`、\`team\`、\`company\`（默认）
- \`status\` - 状态筛选：\`all\`（默认）、\`pending\`、\`approved\`、\`paid\`

### 10. 查看个人信息

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/settings/profile
\`\`\`

---

# 差旅行程规划

除了报销管理外，你还可以帮助用户**事前规划差旅行程**并将行程记录到系统中。完整的工作流程是：

\`\`\`
用户描述出差需求（或在 Telegram 里整理好行程）
  ↓
你整理行程信息（航班、酒店、会议等）
  ↓
用户确认行程方案
  ↓
你将行程写入系统（创建 Trip + Itinerary）
  ↓
你创建预估报销单并提交审批
  ↓
审批通过后，用户出发
\`\`\`

## 行程状态流转

### Trip（行程记录）
\`\`\`
planning（规划中）→ ongoing（进行中）→ completed（已完成）
                                     → cancelled（已取消）
\`\`\`

### Trip Itinerary（行程单）
\`\`\`
draft（草稿）→ confirmed（用户确认）
            → modified（用户修改后）
\`\`\`

## 行程管理 API

### 11. 创建行程（Trip）

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/trips
Content-Type: application/json
\`\`\`

请求体：
\`\`\`json
{
  "title": "北京客户拜访",
  "purpose": "Q2 商务洽谈",
  "destination": "北京",
  "startDate": "2026-03-15",
  "endDate": "2026-03-17",
  "budget": {
    "estimated": 5000,
    "currency": "CNY",
    "breakdown": {
      "flight": 2400,
      "hotel": 1600,
      "meal": 600,
      "transport": 400
    }
  }
}
\`\`\`

必填字段：\`title\`、\`startDate\`、\`endDate\`

需要的 scope：\`trip:create\`

### 12. 查看行程列表

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/trips
\`\`\`

查询参数：
- \`status\` - 筛选状态：\`planning\`、\`ongoing\`、\`completed\`、\`cancelled\`

需要的 scope：\`trip:read\`

### 13. 查看行程详情

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/trips/{id}
\`\`\`

需要的 scope：\`trip:read\`

### 14. 更新行程

\`\`\`http
PUT {REIMBURSEMENT_API_URL}/api/trips/{id}
Content-Type: application/json
\`\`\`

支持部分更新，只传需要修改的字段：
\`\`\`json
{
  "status": "ongoing",
  "destination": "北京, 上海"
}
\`\`\`

需要的 scope：\`trip:create\`

### 15. 创建行程单（Itinerary）

行程单是 Trip 的详细日程安排，包含每天每个时间段的具体活动。

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/trip-itineraries
Content-Type: application/json
\`\`\`

请求体：
\`\`\`json
{
  "tripId": "关联的行程ID（可选）",
  "title": "上海-北京出差行程",
  "purpose": "客户拜访",
  "startDate": "2026-03-15",
  "endDate": "2026-03-17",
  "destinations": ["北京"],
  "status": "draft",
  "items": [
    {
      "date": "2026-03-15",
      "time": "08:00",
      "type": "transport",
      "category": "flight",
      "title": "上海浦东 → 北京首都 MU5101",
      "description": "东方航空经济舱",
      "departure": "上海浦东T1",
      "arrival": "北京首都T2",
      "transportNumber": "MU5101",
      "amount": 1200,
      "currency": "CNY",
      "sortOrder": 0
    },
    {
      "date": "2026-03-15",
      "time": "14:00",
      "type": "meeting",
      "title": "与 XX 公司 Q2 商务洽谈",
      "location": "北京国贸大厦 25F",
      "sortOrder": 2
    },
    {
      "date": "2026-03-15",
      "time": "18:00",
      "type": "hotel",
      "category": "hotel",
      "title": "入住北京希尔顿酒店",
      "hotelName": "北京希尔顿酒店",
      "location": "北京朝阳区",
      "checkIn": "2026-03-15",
      "checkOut": "2026-03-17",
      "amount": 800,
      "currency": "CNY",
      "sortOrder": 3
    }
  ]
}
\`\`\`

**行程明细 item 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| \`date\` | ✅ | 日期 YYYY-MM-DD |
| \`time\` | | 时间 HH:mm |
| \`type\` | ✅ | 类型：\`transport\` / \`hotel\` / \`meal\` / \`meeting\` / \`other\` |
| \`category\` | | 费用类别：\`flight\` / \`train\` / \`hotel\` / \`meal\` / \`taxi\` 等 |
| \`title\` | ✅ | 节点标题 |
| \`description\` | | 详细描述 |
| \`location\` | | 地点 |
| \`departure\` | | 出发地（交通类） |
| \`arrival\` | | 到达地（交通类） |
| \`transportNumber\` | | 航班号/车次 |
| \`hotelName\` | | 酒店名称 |
| \`checkIn\` | | 入住日期 YYYY-MM-DD |
| \`checkOut\` | | 退房日期 YYYY-MM-DD |
| \`amount\` | | 预估金额 |
| \`currency\` | | 币种 |
| \`sortOrder\` | | 排序号（同日期内排序） |

需要的 scope：\`trip:create\`

### 16. 查看行程单列表

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/trip-itineraries
\`\`\`

查询参数：
- \`tripId\` - 按行程筛选
- \`reimbursementId\` - 按报销单筛选

需要的 scope：\`trip:read\`

### 17. 查看行程单详情

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/trip-itineraries/{id}
\`\`\`

需要的 scope：\`trip:read\`

### 18. 更新行程单

\`\`\`http
PUT {REIMBURSEMENT_API_URL}/api/trip-itineraries/{id}
Content-Type: application/json
\`\`\`

支持部分更新。如果传了 \`items\` 数组，会**全量替换**所有明细。

**确认行程单**：\`{ "status": "confirmed" }\`
**关联报销单**：\`{ "reimbursementId": "报销单ID" }\`

需要的 scope：\`trip:create\`

### 19. 删除行程单

\`\`\`http
DELETE {REIMBURSEMENT_API_URL}/api/trip-itineraries/{id}
\`\`\`

级联删除所有明细项。需要的 scope：\`trip:create\`

## 典型对话流程 - 差旅行程规划

### 用户在 Telegram 整理好行程后说："帮我把行程记录到报销系统"

1. 收集用户在聊天中提到的行程信息（日期、航班、酒店、会议等）
2. 查询公司差旅政策：\`GET /api/settings/policies\`
3. 整理成结构化行程，展示给用户确认
4. 创建 Trip：\`POST /api/trips\`
5. 创建 Itinerary：\`POST /api/trip-itineraries\`（status=draft）
6. 确认后更新状态：\`PUT /api/trip-itineraries/{id}\` → status=confirmed
7. 可选：创建预估报销单 \`POST /api/reimbursements\`（status=draft）并关联

### 用户："我下周三到周五要去北京见客户，帮我安排下行程"

1. 确认细节：出发城市、会议时间/地点、预算偏好
2. 查询公司差旅政策：\`GET /api/settings/policies\`
3. 生成行程方案，标注价格和政策合规情况
4. 用户确认后写入系统（创建 Trip + Itinerary）
5. 创建预估报销单并提交审批

## 典型对话流程

### 用户："帮我报销昨天的打车费 45 元"

1. 确认信息：日期、金额、类别、供应商
2. 查询政策确认是否在限额内
3. 展示报销摘要让用户确认
4. 创建报销单（先存草稿）
5. 询问用户是否直接提交审批
6. 如果确认，用 PUT 更新 status 为 pending

### 用户："帮我看看上个月的报销状态"

1. 调用 GET /api/reimbursements 查询列表
2. 格式化展示：标题、金额、状态、日期
3. 如果有被拒绝的，提醒用户查看原因并可协助重新提交

### 用户："帮我报销这张发票"（附带图片）

1. 上传图片到 /api/upload（系统自动 OCR + 汇率转换）
2. 从返回的 \`ocr\` 字段获取金额、币种、类别等信息
3. 展示识别结果让用户确认（金额由系统识别，不可修改）
4. 根据 OCR 结果创建报销单（草稿）
5. 让用户确认后通过 PUT 提交

### 用户："那笔被驳回的报销帮我重新提交"

1. 调用 GET /api/reimbursements?status=rejected 查找被驳回的单据
2. 展示驳回原因（rejectReason 字段）
3. 询问用户是否需要修改
4. 用 PUT 更新内容并设 status 为 pending 重新提交

### 用户："删掉那个草稿报销单"

1. 调用 GET /api/reimbursements?status=draft 查找草稿
2. 确认用户要删除哪一笔
3. 调用 DELETE /api/reimbursements/{id} 删除

## 审批提醒

OpenClaw 可以帮助审批人查看待审批的报销单，并通过 Telegram 发送提醒。

### 20. 查看待审批报销单

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/approvals/pending
\`\`\`

返回当前用户（API Key 绑定的用户）作为审批人的待审批报销单列表。

需要的 scope：\`approval:read\`

响应示例：
\`\`\`json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "3月北京出差报销",
      "totalAmount": 5200,
      "baseCurrency": "CNY",
      "status": "pending",
      "submittedAt": "2026-03-15T10:00:00Z",
      "waitingDays": 4,
      "submitter": { "id": "uuid", "name": "张三", "email": "zhangsan@example.com" },
      "approvalStep": { "stepOrder": 1, "stepType": "manager", "stepName": "直属上级审批" }
    }
  ],
  "meta": { "total": 1 }
}
\`\`\`

### 21. 触发审批提醒（Telegram）

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/cron/approval-reminder
\`\`\`

手动触发一次审批提醒，通过 Telegram 通知所有待审批的审批人。

## 错误处理

所有错误响应格式：
\`\`\`json
{
  "success": false,
  "error": "人类可读的错误描述",
  "error_code": "MACHINE_READABLE_CODE"
}
\`\`\`

- \`error\` 字段是字符串，可以直接展示给用户
- \`error_code\` 字段是机器可读的错误码，用于程序化判断错误类型

常见错误码：

| HTTP 状态码 | 错误码 | 含义 | 建议操作 |
|------------|--------|------|---------|
| - | （连接失败） | \`REIMBURSEMENT_API_URL\` 未配置或格式错误 | 检查环境变量是否已设置完整的 URL（含 https://） |
| 401 | \`INVALID_API_KEY\` | API Key 无效 | 检查 Key 是否正确，是否以 \`rk_\` 开头 |
| 401 | \`API_KEY_EXPIRED\` | API Key 已过期 | 提醒用户重新生成 Key |
| 401 | \`API_KEY_DISABLED\` | API Key 已停用 | 提醒用户在后台重新启用 |
| 401 | \`API_KEY_REVOKED\` | API Key 已撤销 | 提醒用户重新创建 Key |
| 403 | \`INSUFFICIENT_SCOPE\` | 权限不足 | 告知用户需要哪个 scope，提示在 API Key 设置中添加 |
| 403 | \`ROLE_INSUFFICIENT\` | 用户角色不够 | 该操作需要更高角色（如 manager/admin） |
| 400 | - | 请求参数错误 | 根据 message 字段提示用户修正 |
| 404 | - | 资源不存在 | 确认 ID 是否正确 |
| 429 | \`RATE_LIMITED\` | 请求过于频繁 | 读取 \`Retry-After\` 响应头，等待后重试 |
| 500 | - | 服务器错误 | 建议稍后重试 |
`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format'); // 'json' | 'markdown' (default)

  // 从请求中推断服务的基础 URL
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  if (format === 'json') {
    return NextResponse.json({
      ...SKILL_META,
      base_url: baseUrl,
      status_flow: {
        draft: ['pending'],
        pending: ['draft', 'approved', 'rejected', 'under_review'],
        under_review: ['approved', 'rejected'],
        rejected: ['draft', 'pending'],
        approved: ['processing'],
        processing: ['paid'],
      },
      endpoints: [
        { method: 'GET', path: '/api/reimbursements', scope: 'reimbursement:read', description: '查看报销单列表' },
        { method: 'POST', path: '/api/reimbursements', scope: 'reimbursement:create', description: '创建报销单' },
        { method: 'PUT', path: '/api/reimbursements/{id}', scope: 'reimbursement:update', description: '更新报销单（编辑/提交/撤回）' },
        { method: 'DELETE', path: '/api/reimbursements/{id}', scope: 'reimbursement:cancel', description: '删除报销单（仅 draft/rejected）' },
        { method: 'PATCH', path: '/api/reimbursements/{id}', scope: 'approval:approve', description: '审批操作（批准/驳回）' },
        { method: 'POST', path: '/api/upload', scope: 'receipt:upload', description: '上传票据' },
        { method: 'POST', path: '/api/ocr', scope: 'receipt:upload', description: 'OCR 识别发票' },
        { method: 'GET', path: '/api/settings/categories', scope: 'settings:read', description: '获取费用类别（初始化必调）' },
        { method: 'GET', path: '/api/settings/policies', scope: 'policy:read', description: '查看报销政策' },
        { method: 'GET', path: '/api/analytics/expenses', scope: 'analytics:read', description: '查看费用分析' },
        { method: 'GET', path: '/api/settings/profile', scope: 'profile:read', description: '查看个人信息' },
        { method: 'POST', path: '/api/trips', scope: 'trip:create', description: '创建行程' },
        { method: 'GET', path: '/api/trips', scope: 'trip:read', description: '查看行程列表' },
        { method: 'GET', path: '/api/trips/{id}', scope: 'trip:read', description: '查看行程详情' },
        { method: 'PUT', path: '/api/trips/{id}', scope: 'trip:create', description: '更新行程' },
        { method: 'POST', path: '/api/trip-itineraries', scope: 'trip:create', description: '创建行程单（含明细）' },
        { method: 'GET', path: '/api/trip-itineraries', scope: 'trip:read', description: '查看行程单列表' },
        { method: 'GET', path: '/api/trip-itineraries/{id}', scope: 'trip:read', description: '查看行程单详情' },
        { method: 'PUT', path: '/api/trip-itineraries/{id}', scope: 'trip:create', description: '更新行程单' },
        { method: 'DELETE', path: '/api/trip-itineraries/{id}', scope: 'trip:create', description: '删除行程单' },
        { method: 'GET', path: '/api/approvals/pending', scope: 'approval:read', description: '查看待审批报销单' },
        { method: 'GET', path: '/api/cron/approval-reminder', scope: null, description: '触发审批提醒（Telegram）' },
      ],
      available_scopes: [
        'reimbursement:read', 'reimbursement:create', 'reimbursement:update',
        'reimbursement:submit', 'reimbursement:cancel',
        'receipt:read', 'receipt:upload',
        'policy:read', 'trip:read', 'trip:create',
        'analytics:read', 'profile:read', 'settings:read',
        'approval:read',
      ],
      error_codes: [
        { code: 'INVALID_API_KEY', status: 401, description: 'API Key 无效' },
        { code: 'API_KEY_EXPIRED', status: 401, description: 'API Key 已过期' },
        { code: 'API_KEY_DISABLED', status: 401, description: 'API Key 已停用' },
        { code: 'API_KEY_REVOKED', status: 401, description: 'API Key 已撤销' },
        { code: 'INSUFFICIENT_SCOPE', status: 403, description: '权限不足' },
        { code: 'ROLE_INSUFFICIENT', status: 403, description: '用户角色不够' },
        { code: 'RATE_LIMITED', status: 429, description: '请求过于频繁' },
      ],
    });
  }

  // 默认返回 Markdown
  const markdown = generateSkillMarkdown(baseUrl);
  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
