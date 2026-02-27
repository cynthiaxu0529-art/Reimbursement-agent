---
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
| `REIMBURSEMENT_API_KEY` | ✅ | API 认证密钥，以 `rk_` 开头 | `rk_abc123...` |
| `REIMBURSEMENT_API_URL` | ✅ | 报销服务的完整基础 URL（不带末尾斜杠） | `https://reimbursement.example.com` |

**常见错误**：只配置了 `REIMBURSEMENT_API_KEY` 而没有配置 `REIMBURSEMENT_API_URL`，会导致所有 API 请求失败（地址为空）。请确保两个变量都已正确设置。

获取方式：登录报销系统后台，进入 **设置 → API 密钥** 页面创建密钥，同时记下系统的访问地址作为 `REIMBURSEMENT_API_URL`。

## 认证

所有 API 请求必须在 Header 中携带：
```
Authorization: Bearer {REIMBURSEMENT_API_KEY}
```

API 基础地址：`{REIMBURSEMENT_API_URL}`

## 重要安全规则

1. **创建报销前必须确认**：在提交报销单之前，先向用户展示报销明细摘要并请求确认
2. **金额核实**：如果用户提供的票据金额与口述金额不一致，主动提醒
3. **政策合规**：提交前先查询政策确认是否超限
4. **不要猜测**：如果用户没有提供必要信息（金额、类别、日期），请追问而不是猜测

## 报销单状态流转

报销单有以下状态，只能按箭头方向流转：

```
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
```

**各状态允许的操作：**

| 当前状态 | 可流转到 | 操作方式 |
|----------|----------|----------|
| `draft` | `pending` | PUT 更新时设 `status: "pending"` |
| `pending` | `draft` | PUT 更新时设 `status: "draft"`（撤回） |
| `pending` | `approved` / `rejected` / `under_review` | PATCH 审批操作 |
| `under_review` | `approved` / `rejected` | PATCH 审批操作 |
| `rejected` | `draft` / `pending` | PUT 更新时设新 status（重新编辑或提交） |
| `approved` | `processing` | 系统自动发起支付 |

**可删除的状态**：仅 `draft` 和 `rejected` 状态的报销单可以删除。

## 登录后初始化

认证成功后，在执行任何报销操作之前，必须先获取当前公司的费用类别配置：

```http
GET {REIMBURSEMENT_API_URL}/api/settings/categories
```

返回示例：
```json
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
```

**注意**：不同公司的费用类别不同，创建报销时 `category` 字段的值必须来自此接口返回的 `value` 列表。不要使用硬编码的类别值。

## 可用操作

### 1. 查看报销单列表

```http
GET {REIMBURSEMENT_API_URL}/api/reimbursements
```

查询参数：
- `status` - 筛选状态：draft, pending, under_review, approved, rejected, processing, paid（支持逗号分隔多选）
- `page` - 页码（默认 1）
- `pageSize` - 每页数量（默认 50）

示例响应：
```json
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
```

### 2. 创建报销单

```http
POST {REIMBURSEMENT_API_URL}/api/reimbursements
Content-Type: application/json
```

请求体：
```json
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
```

费用类别（category）：使用 `GET /api/settings/categories` 返回的 `value` 值，不要硬编码。

状态说明：
- `"status": "draft"` - 仅保存草稿（推荐，让用户确认后再提交）
- `"status": "pending"` - 直接提交审批（需要 `reimbursement:submit` scope）

响应示例：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "2月北京出差报销",
    "status": "draft",
    "totalAmount": 3150,
    "createdAt": "2026-02-20T10:00:00Z"
  },
  "limitAdjustments": {
    "count": 1,
    "messages": ["酒店费用超过每日限额，已从 1600 调整为 1400"],
    "message": "有 1 项费用超过政策限额，已自动调整"
  }
}
```

**注意**：如果费用超过政策限额，系统会自动调整金额并在 `limitAdjustments` 中说明。请将调整信息告知用户。

### 3. 更新报销单

```http
PUT {REIMBURSEMENT_API_URL}/api/reimbursements/{id}
Content-Type: application/json
```

仅 `draft` 或 `rejected` 状态的报销单可以编辑内容。也用于提交和撤回操作。

请求体（与创建类似，额外支持 status 变更）：
```json
{
  "title": "修改后的标题",
  "description": "修改后的描述",
  "status": "pending",
  "items": [
    {
      "category": "taxi",
      "description": "机场打车",
      "amount": 150,
      "currency": "CNY",
      "date": "2026-02-15"
    }
  ]
}
```

**状态变更用法：**
- 草稿提交审批：`{ "status": "pending" }`
- 撤回已提交的报销：`{ "status": "draft" }`
- 驳回后重新提交：`{ "status": "pending" }`（会清除驳回信息）

### 4. 删除报销单

```http
DELETE {REIMBURSEMENT_API_URL}/api/reimbursements/{id}
```

仅 `draft` 和 `rejected` 状态的报销单可以删除。删除后不可恢复。

响应：
```json
{
  "success": true,
  "message": "删除成功"
}
```

### 5. 上传票据/发票

```http
POST {REIMBURSEMENT_API_URL}/api/upload
Content-Type: multipart/form-data
```

表单字段：
- `file` - 图片文件（支持 jpg, png, webp, gif, pdf，最大 10MB）

上传后会返回票据 URL，可以在创建报销时通过 `receiptUrl` 字段关联：
```json
{
  "success": true,
  "url": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg",
  "filename": "receipt.jpg",
  "size": 102400,
  "type": "image/jpeg"
}
```

### 6. OCR 识别发票

```http
POST {REIMBURSEMENT_API_URL}/api/ocr
Content-Type: application/json
```

```json
{
  "imageUrl": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg"
}
```

返回发票识别结果，可用于自动填充报销明细：
```json
{
  "success": true,
  "data": {
    "type": "taxi",
    "category": "taxi",
    "amount": 45.00,
    "currency": "CNY",
    "vendor": "滴滴出行",
    "date": "2026-02-15",
    "confidence": 0.95
  }
}
```

### 7. 查看报销政策

```http
GET {REIMBURSEMENT_API_URL}/api/settings/policies
```

返回公司报销政策规则，包括各类别的限额。提交报销前建议先查询政策。

响应示例：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "差旅费报销政策",
      "description": "出差期间住宿和餐饮费用限额",
      "isActive": true,
      "rules": [
        {
          "name": "中国大陆出差每日限额",
          "categories": ["hotel", "meal"],
          "limit": { "type": "per_day", "amount": 100, "currency": "USD" },
          "message": "中国大陆出差，住宿+餐饮每人每天不超过$100"
        }
      ]
    }
  ]
}
```

### 8. 获取费用类别

```http
GET {REIMBURSEMENT_API_URL}/api/settings/categories
```

返回当前公司可用的费用类别列表。创建报销时 `category` 字段的值**必须**来自此接口返回的 `value`。

需要的 scope：`settings:read`

### 9. 查看费用分析

```http
GET {REIMBURSEMENT_API_URL}/api/analytics/expenses
```

查询参数：
- `period` - 时间范围：`month`（默认）、`quarter`、`year`、`custom`、`all`
- `months` - 分析月份数（默认 3）
- `startDate` / `endDate` - 自定义时间范围（period=custom 时使用）
- `scope` - 数据范围：`personal`、`team`、`company`（默认）
- `status` - 状态筛选：`all`（默认）、`pending`、`approved`、`paid`

### 10. 查看个人信息

```http
GET {REIMBURSEMENT_API_URL}/api/settings/profile
```

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

1. 上传图片到 /api/upload
2. 调用 /api/ocr 识别发票内容
3. 展示识别结果让用户确认
4. 根据识别结果自动创建报销单（草稿）
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

## 错误处理

所有错误响应格式：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

常见错误码：

| HTTP 状态码 | 错误码 | 含义 | 建议操作 |
|------------|--------|------|---------|
| - | （连接失败） | `REIMBURSEMENT_API_URL` 未配置或格式错误 | 检查环境变量是否已设置完整的 URL（含 https://） |
| 401 | `INVALID_API_KEY` | API Key 无效 | 检查 Key 是否正确，是否以 `rk_` 开头 |
| 401 | `API_KEY_EXPIRED` | API Key 已过期 | 提醒用户重新生成 Key |
| 401 | `API_KEY_DISABLED` | API Key 已停用 | 提醒用户在后台重新启用 |
| 401 | `API_KEY_REVOKED` | API Key 已撤销 | 提醒用户重新创建 Key |
| 403 | `INSUFFICIENT_SCOPE` | 权限不足 | 告知用户需要哪个 scope，提示在 API Key 设置中添加 |
| 403 | `ROLE_INSUFFICIENT` | 用户角色不够 | 该操作需要更高角色（如 manager/admin） |
| 400 | - | 请求参数错误 | 根据 message 字段提示用户修正 |
| 404 | - | 资源不存在 | 确认 ID 是否正确 |
| 429 | `RATE_LIMITED` | 请求过于频繁 | 读取 `Retry-After` 响应头，等待后重试 |
| 500 | - | 服务器错误 | 建议稍后重试 |
