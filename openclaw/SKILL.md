---
name: reimbursement
description: 企业报销管理 - 帮助用户规划差旅行程、搜索机票酒店、提交报销、上传发票、查询报销状态、查看政策和分析费用
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

获取方式：登录报销系统后台，点击侧栏 **API Keys** 页面创建密钥，同时记下系统的访问地址作为 `REIMBURSEMENT_API_URL`。

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
5. **凭证必须关联（最重要）**：每个费用明细的 `receiptUrl` 字段**必须**填入对应上传返回的 `url`。没有凭证的费用项会被财务驳回。**绝对不能**创建 `receiptUrl` 为空的费用项
6. **同时填写原币和本位币金额**：创建报销时，每个 item 必须同时填写：
   - `amount` + `currency`：票据上的**原始币种和原始金额**（如 CNY 662）
   - `exchangeRate` + `amountInBaseCurrency`：使用初始化时获取的**公司汇率表**手动计算转换后的本位币金额（如 USD 91.36）
   - **不要**用 OCR 返回的 `amountInBaseCurrency`，那是 OCR 按外部汇率估算的，可能与公司汇率不一致
7. **汇率必须来自公司汇率表**：初始化时 `GET /api/exchange-rates?target={本位币}` 返回的汇率是公司管理员设定的月初固定汇率。Agent 必须使用这个汇率计算 `amountInBaseCurrency`，不要用 OCR 返回的汇率或自己查询的汇率
8. **政策限额以本位币（USD）为准**：公司的报销政策（如酒店每日 $100 限额）、审批规则、支付规则都以**本位币金额（amountInBaseCurrency）**为判断标准。Agent 在提交前自查政策合规时，必须用转换后的**美元金额**与政策限额对比，不要用原币金额对比
9. **标题必须包含具体日期和路线**：报销单 `title` 必须写明**具体出差日期**和**往返城市**，格式示例：
   - ✅ `"1月20-22日北京-杭州往返出差"` — 有日期区间、有城市
   - ✅ `"3月5日上海客户拜访"` — 有日期、有城市
   - ❌ `"2025年12月杭州出差"` — 只有月份，没有具体日期
   - ❌ `"2025年11月上海出差"` — 太模糊
   - 日期从票据（OCR 识别的 `date`、`checkInDate`）中提取，城市从 `departure`/`destination` 或 `location` 中提取
10. **创建前必须查重**：创建报销单之前，**必须**先调用 `GET /api/reimbursements` 查询该用户的历史报销单。检查是否存在相同日期、相同金额或相同路线的费用项，避免重复报销。如果发现疑似重复，必须告知用户并请求确认后再创建

## 必须执行的初始化步骤

在执行**任何**报销操作之前，必须先完成以下初始化（按顺序）：

1. **获取费用类别**：`GET /api/settings/categories` — 获取公司允许的费用类别
2. **获取汇率表**：`GET /api/exchange-rates?target={公司本位币}` — 获取管理员设定的当月汇率表，了解各币种的汇率
3. **获取报销政策**：`GET /api/settings/policies` — 获取公司报销规则和各类别限额

**只有完成以上三步后**，才能开始上传凭证、创建报销单等操作。这确保了：
- 费用类别正确（不会用错类别值）
- 汇率与公司设定一致（不会出现汇率偏差）
- 报销金额符合政策限额（避免被驳回）

**汇率使用示例**：假设汇率表返回 `CNY → USD = 0.1380`，OCR 识别出 ¥662 CNY：
- `amount` = 662, `currency` = "CNY"
- `exchangeRate` = 0.1380（来自公司汇率表，不是 OCR 返回的值）
- `amountInBaseCurrency` = 662 × 0.1380 = **91.36**（用于政策限额对比、审批和支付判断）

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

认证成功后，在执行任何报销操作之前，**必须按顺序**完成以下三个初始化请求：

### 步骤 1：获取费用类别

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

### 步骤 2：获取公司汇率表

```http
GET {REIMBURSEMENT_API_URL}/api/exchange-rates?target={公司本位币}
```

返回示例（以 USD 为本位币）：
```json
{
  "target": "USD",
  "rates": {
    "CNY": { "rate": 0.1380, "source": "monthly_manual" },
    "EUR": { "rate": 1.0850, "source": "monthly_manual" },
    "JPY": { "rate": 0.0067, "source": "monthly_api" }
  },
  "timestamp": "2026-03-01T00:00:00Z"
}
```

**注意**：
- `source` 为 `monthly_manual` 表示管理员手动设定的汇率，具有最高优先级
- **必须记住这些汇率值**，后续创建报销时用于计算 `amountInBaseCurrency`
- 计算公式：`amountInBaseCurrency` = `amount`（原币金额）× 该币种到本位币的汇率
- 政策限额（如酒店每日 $100）、审批阈值、支付规则都以 `amountInBaseCurrency` 为判断标准

### 步骤 3：获取报销政策

```http
GET {REIMBURSEMENT_API_URL}/api/settings/policies
```

返回报销规则和限额。**必须仔细阅读每条规则**，在后续创建报销时检查是否超限。

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
          "amountInBaseCurrency": 165.6,
          "date": "2026-02-15",
          "vendor": "东方航空",
          "receiptUrl": "https://xxx.blob.vercel-storage.com/receipt-flight.jpg"
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

**返回字段说明**：每个 item 包含 `receiptUrl`（票据图片地址，可能为 `null`）。Agent 可以通过此字段判断某项费用是否已关联票据，如果为 `null` 则缺少附件，应提醒用户补充上传。

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
      "exchangeRate": 0.1380,
      "amountInBaseCurrency": 165.60,
      "date": "2026-02-15",
      "vendor": "东方航空",
      "location": "上海",
      "receiptUrl": "https://xxx.blob.vercel-storage.com/receipt-flight.jpg"
    },
    {
      "category": "hotel",
      "description": "北京希尔顿酒店 2晚",
      "amount": 1600,
      "currency": "CNY",
      "exchangeRate": 0.1380,
      "amountInBaseCurrency": 220.80,
      "date": "2026-02-15",
      "vendor": "希尔顿酒店",
      "location": "北京",
      "checkInDate": "2026-02-15",
      "checkOutDate": "2026-02-17",
      "nights": 2,
      "receiptUrl": "https://xxx.blob.vercel-storage.com/receipt-hotel.jpg"
    },
    {
      "category": "meal",
      "description": "客户午餐",
      "amount": 350,
      "currency": "CNY",
      "exchangeRate": 0.1380,
      "amountInBaseCurrency": 48.30,
      "date": "2026-02-16",
      "vendor": "全聚德",
      "location": "北京",
      "receiptUrl": "https://xxx.blob.vercel-storage.com/receipt-meal.jpg"
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

**注意事项：**
- **⚠️ 必须附带票据（最重要）**：每个费用明细的 `receiptUrl` 字段**必须**填入对应的票据图片 URL。没有附件的报销会被财务驳回。流程是：先调用 `POST /api/upload` 上传票据获取 `url`，然后把该 `url` 填入 items 的 `receiptUrl` 字段。**创建报销前检查：每个 item 是否都有非空的 `receiptUrl`？如果有缺失，必须先上传凭证。**
- **⚠️ 同时填写原币和本位币金额**：每个 item 必须包含以下全部字段：
  - `amount`：OCR 识别的原始金额（如 `662`），不可修改
  - `currency`：票据上的原始币种（如 `CNY`）
  - `exchangeRate`：**公司汇率表**中该币种到本位币的汇率（如 `0.1380`）
  - `amountInBaseCurrency`：`amount` × `exchangeRate` 的结果（如 `91.36`）
- **⚠️ 政策对比用美元金额**：系统的限额规则（如酒店每日 $100）、审批阈值、支付判断都以 `amountInBaseCurrency` 为准。Agent 提交前应自行用美元金额检查是否超限。
- 如果费用超过政策限额，系统会自动调整金额并在 `limitAdjustments` 中说明。请将调整信息告知用户。
- **OCR 金额保护**：通过 OCR 识别出的发票原始金额应如实填入 `amount`，不要修改 OCR 识别的金额。
- **🏨 酒店必须传入住天数**：酒店类别的费用项**必须**同时填入 `checkInDate`、`checkOutDate`、`nights`（从 OCR 返回值中获取）。如果缺失这些字段，系统会按 **1 晚**计算每日限额，导致多晚住宿被错误截断。例如：2 晚酒店不传 `nights`，限额只算 $100（而非 $200），金额会被错误调整。

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

### 3a. 修改单个费用明细

```http
PATCH {REIMBURSEMENT_API_URL}/api/reimbursements/{id}/items/{itemId}
Content-Type: application/json
```

仅 `draft` 或 `rejected` 状态的报销单可以编辑。支持局部更新，只需传要修改的字段。

请求体（所有字段均为可选，只传需要修改的）：
```json
{
  "amount": 200,
  "currency": "CNY",
  "category": "taxi",
  "description": "机场打车（修改后）",
  "vendor": "滴滴出行",
  "date": "2026-02-16",
  "receiptUrl": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg"
}
```

响应示例：
```json
{
  "success": true,
  "data": { "id": "itemId", "amount": 200, "..." : "..." },
  "limitAdjustment": {
    "wasAdjusted": true,
    "message": "金额超过每日限额，已从 200 调整为 150"
  }
}
```

**注意**：如果金额超过政策限额，系统会自动调整并在 `limitAdjustment` 中说明。

**与 PUT /api/reimbursements/{id} 的区别**：
- `PUT` 是**全量替换**所有费用明细（传完整 items 数组），适合批量修改
- `PATCH` 是**修改单个**费用明细，适合只改一项的场景（更高效）

### 3b. 删除单个费用明细

```http
DELETE {REIMBURSEMENT_API_URL}/api/reimbursements/{id}/items/{itemId}
```

仅 `draft` 或 `rejected` 状态的报销单可以编辑。至少需要保留一项费用明细，不能删除最后一项。

响应：
```json
{
  "success": true,
  "message": "删除成功"
}
```

**注意**：删除后报销单总金额会自动重新计算。如需删除整个报销单，请用下方的 DELETE /api/reimbursements/{id}。

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

### 5. 上传票据（推荐 - 自动 OCR + 汇率转换）

```http
POST {REIMBURSEMENT_API_URL}/api/upload
Content-Type: multipart/form-data
```

表单字段：
- `file` - 图片文件（支持 jpg, png, webp, gif, pdf，最大 10MB）
- `mode` -（可选）设为 `upload_only` 时仅上传文件，跳过 OCR 和汇率转换

**三种上传模式：**

#### 模式 A：自动 OCR 模式（默认，multipart 文件）

不传 `mode` 字段，系统自动完成：
1. 上传图片到云存储
2. 自动 OCR 识别发票内容（金额、币种、商家、日期、类别）
3. 自动按管理员设定的月初汇率转换为公司本位币

#### 模式 B：仅上传模式（multipart 文件）

传 `mode=upload_only`，系统仅上传文件，不做 OCR 识别。适用于：
- 用户已经提供了金额等信息，不需要 OCR
- 凭证格式特殊，OCR 识别不准确
- 只需要上传附件获取 URL

#### 模式 C：URL 转存模式（JSON 请求，Agent 专用）

**当 Agent 只有图片 URL 而无法直接上传二进制文件时**，可用 JSON 方式请求，服务端会自动从该 URL 下载图片并永久存储至云存储：

```http
POST {REIMBURSEMENT_API_URL}/api/upload
Content-Type: application/json
```

```json
{
  "imageUrl": "https://platform-uploads.example.com/your-receipt-url.jpg"
}
```

返回格式与模式 A 完全相同（包含 `url` 和 `ocr` 数据）。

**⚠️ 严禁将第三方 URL 直接用作 receiptUrl**：来自聊天平台（如 OpenClaw）的图片 URL 会在数小时内过期或需要身份验证，导致财务审核时图片无法查看。必须通过 `/api/upload` 将图片转存到报销系统自己的存储后，才能将返回的 `url` 用作 `receiptUrl`。

响应示例（模式 A - 火车票 OCR）：
```json
{
  "success": true,
  "url": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg",
  "filename": "receipt.jpg",
  "size": 102400,
  "type": "image/jpeg",
  "ocr": {
    "type": "train_ticket",
    "category": "train",
    "amount": 662.00,
    "currency": "CNY",
    "vendor": "中国铁路",
    "date": "2026-01-04",
    "confidence": 0.95,
    "departure": "北京南",
    "destination": "上海虹桥",
    "trainNumber": "G5",
    "exchangeRate": 0.138,
    "amountInBaseCurrency": 91.36,
    "baseCurrency": "USD"
  }
}
```

响应示例（模式 A - 酒店票据 OCR）：
```json
{
  "success": true,
  "url": "https://xxx.blob.vercel-storage.com/receipt-hotel.jpg",
  "filename": "hotel-receipt.jpg",
  "size": 204800,
  "type": "image/jpeg",
  "ocr": {
    "type": "hotel_receipt",
    "category": "hotel",
    "amount": 1200.00,
    "currency": "CNY",
    "vendor": "希尔顿酒店",
    "date": "2026-02-15",
    "confidence": 0.92,
    "checkInDate": "2026-02-15",
    "checkOutDate": "2026-02-17",
    "nights": 2,
    "exchangeRate": 0.138,
    "amountInBaseCurrency": 165.60,
    "baseCurrency": "USD"
  }
}
```

**⚠️ 关键：正确使用 OCR 返回值创建报销**

| OCR 返回字段 | 用途 | 填入报销 item 的字段 |
|---|---|---|
| 顶层 `url` | **凭证附件地址（必须！）** | `receiptUrl` |
| `ocr.amount` | **票面原始金额** | `amount` |
| `ocr.currency` | **票面原始币种** | `currency` |
| `ocr.category` | 费用类别 | `category` |
| `ocr.vendor` | 商家名称 | `vendor` |
| `ocr.date` | 日期 | `date` |
| `ocr.departure` | 出发地 | `description` 中描述 |
| `ocr.destination` | 目的地 | `description` 中描述 |
| `ocr.checkInDate` | 酒店入住日期 | `checkInDate`（**酒店必填**） |
| `ocr.checkOutDate` | 酒店离店日期 | `checkOutDate`（**酒店必填**） |
| `ocr.nights` | 住宿晚数 | `nights`（**酒店必填**） |
| `ocr.exchangeRate` | ⚠️ OCR 估算的汇率 | **不要使用**，改用公司汇率表 |
| `ocr.amountInBaseCurrency` | ⚠️ OCR 估算的本位币 | **不要使用**，自己用公司汇率算 |

Agent 还需自行填写（根据公司汇率表计算）：
- `exchangeRate` = 公司汇率表中该币种到本位币的汇率
- `amountInBaseCurrency` = `amount` × `exchangeRate`

**🏨 酒店住宿特别说明**：
- 酒店票据的 OCR 会返回 `checkInDate`、`checkOutDate`、`nights` 三个字段
- **必须**将这三个字段填入报销 item，否则系统会按 1 晚计算限额
- 每日限额（如 $100/天）会乘以住宿天数：2 晚 = $200 限额，3 晚 = $300 限额
- 政策对比示例：2 晚酒店 ¥1200 CNY → $165.60 USD，限额 $100×2=$200，未超限
- 如果不传 `nights`/`checkInDate`/`checkOutDate`，系统默认按 1 晚 $100 限额判断，$165.60 会被判定超限并截断为 $100

**❌ 错误做法 1**（把转换后金额当原始金额，汇率=1.0000）：
```json
{ "amount": 91.36, "currency": "USD" }
```

**❌ 错误做法 2**（只填原币，不填本位币金额，导致服务端用外部汇率兜底）：
```json
{ "amount": 662, "currency": "CNY" }
```

**✅ 正确做法**（同时填写原币 + 公司汇率 + 本位币金额）：
```json
{
  "amount": 662.00,
  "currency": "CNY",
  "exchangeRate": 0.1380,
  "amountInBaseCurrency": 91.36,
  "receiptUrl": "https://xxx.blob..."
}
```
其中 `exchangeRate` 和 `amountInBaseCurrency` 来自公司汇率表（初始化步骤 2 获取），不是 OCR 返回值。

**完整流程示例（上传 → 创建报销）：**
1. 调用 `POST /api/upload` 上传每张票据 → 记下返回的 **`url`**（顶层字段）和 `ocr` 数据
2. 用初始化获取的**公司汇率表**计算每项的 `exchangeRate` 和 `amountInBaseCurrency`
3. **政策自查**：用 `amountInBaseCurrency`（美元金额）与政策限额对比（如酒店每日 $100）
4. 创建报销时，每个 item 都**必须**填入：`amount`、`currency`、`exchangeRate`、`amountInBaseCurrency`、`receiptUrl`
5. 没有 `receiptUrl` 的报销会被财务驳回，**务必确保每项都附带票据**

### 6. OCR 识别发票（备用）

```http
POST {REIMBURSEMENT_API_URL}/api/ocr
Content-Type: application/json
```

```json
{
  "imageUrl": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg"
}
```

**注意**：推荐使用上方的 `POST /api/upload`，上传时自动完成 OCR + 汇率转换。此端点作为备用，适用于已有图片 URL 需要单独识别的场景。Agent 调用时同样会自动附带汇率转换结果。

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

### 8a. 获取公司汇率表（初始化必读）

```http
GET {REIMBURSEMENT_API_URL}/api/exchange-rates?target={本位币}
```

查询参数：
- `target` - 目标本位币（如 `USD`、`CNY`），返回所有货币到该本位币的汇率
- `from` + `to` - 查询单个货币对汇率（如 `from=CNY&to=USD`）

**重要**：这个接口返回的是管理员设定的月初固定汇率。初始化时必须调用，以了解公司使用的汇率。

响应示例：
```json
{
  "target": "USD",
  "rates": {
    "CNY": { "rate": 0.1380, "source": "monthly_manual" },
    "EUR": { "rate": 1.0850, "source": "monthly_manual" },
    "JPY": { "rate": 0.0067, "source": "monthly_api" }
  },
  "timestamp": "2026-03-01T00:00:00Z"
}
```

**`source` 字段含义**：
- `monthly_manual` — 管理员手动设定的汇率（优先级最高，最可信）
- `monthly_api` / `monthly_exchangerate-api.com` — 从外部 API 获取的月初汇率
- `fallback` — 备用汇率（API 不可用时的兜底值）

**用途**：
- 创建报销时，用此汇率计算每个 item 的 `exchangeRate` 和 `amountInBaseCurrency`
- 政策限额对比时，用此汇率将原币金额换算为美元再与限额比较
- 向用户展示汇率和换算后金额

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

1. **初始化**（如尚未完成）：获取费用类别、汇率表、报销政策
2. **查重**：`GET /api/reimbursements` 查询历史报销，检查是否存在相同日期/金额/路线的费用项。如有疑似重复，提醒用户确认
3. **上传凭证**：`POST /api/upload` 上传图片 → 记下返回的 **`url`** 和 `ocr` 数据
4. **用公司汇率计算本位币金额**：
   - 从初始化获取的汇率表中查找 `ocr.currency` → 本位币的汇率（如 CNY→USD = 0.1380）
   - 计算 `amountInBaseCurrency` = `ocr.amount` × 汇率（如 662 × 0.1380 = 91.36）
5. **展示识别结果**让用户确认：
   - 原始金额：¥662 CNY
   - 公司汇率：0.1380（来自公司汇率表）
   - 本位币金额：$91.36 USD（用于政策对比和审批）
   - 类别、商家、日期等
6. **检查政策**（用美元金额对比）：如酒店每日限额 $100，用 $91.36 对比，未超限
7. **生成标题**：从票据中提取具体日期和城市，如 `"1月4日北京南-上海虹桥火车票报销"`
8. **创建报销单**（草稿）：
   - `title` = 包含具体日期和路线的标题
   - `amount` = 662（原始金额）
   - `currency` = "CNY"（原始币种）
   - `exchangeRate` = 0.1380（公司汇率表）
   - `amountInBaseCurrency` = 91.36（amount × exchangeRate）
   - `receiptUrl` = 步骤 3 返回的 **`url`**（顶层字段）
9. **最终检查**：确认每个 item 都有 `receiptUrl`、`exchangeRate`、`amountInBaseCurrency`
10. 让用户确认后通过 PUT 提交

**⚠️ 常见错误**：
- 忘记填 `receiptUrl` → 报销单没有附件，财务驳回
- 把 OCR 的 `amountInBaseCurrency` 当作 `amount` 填入 → 汇率显示 1.0000
- 用 OCR 返回的 `exchangeRate` 而非公司汇率表 → 汇率与公司设定不一致
- 用原币金额（¥662）对比美元限额（$100）→ 误判超限

### 用户："那笔被驳回的报销帮我重新提交"

1. 调用 GET /api/reimbursements?status=rejected 查找被驳回的单据
2. 展示驳回原因（rejectReason 字段）
3. 询问用户是否需要修改
4. 用 PUT 更新内容并设 status 为 pending 重新提交

### 用户："帮我把那笔报销里的打车费改成 80 元"

1. 调用 GET /api/reimbursements 找到对应报销单和费用明细
2. 确认要修改的明细项（展示当前金额）
3. 调用 PATCH /api/reimbursements/{id}/items/{itemId} 修改金额
4. 如果系统返回 limitAdjustment，告知用户金额被政策调整

### 用户："帮我删掉报销单里的那笔餐费"

1. 调用 GET /api/reimbursements 找到对应报销单
2. 确认要删除的明细项（展示明细内容）
3. 调用 DELETE /api/reimbursements/{id}/items/{itemId} 删除
4. 告知用户删除成功，报销总金额已自动更新

### 用户："删掉那个草稿报销单"

1. 调用 GET /api/reimbursements?status=draft 查找草稿
2. 确认用户要删除哪一笔
3. 调用 DELETE /api/reimbursements/{id} 删除

---

# 差旅行程规划

除了报销管理外，你还可以帮助用户**事前规划差旅行程**。完整的工作流程是：

```
用户描述出差需求（或让你读取日历）
  ↓
你搜索机票、酒店信息并给出建议
  ↓
用户确认行程方案
  ↓
你将行程写入系统（创建 Trip + Itinerary）
  ↓
你创建预估报销单并提交审批
  ↓
审批通过后，用户出发
```

## 行程状态流转

### Trip（行程记录）
```
planning（规划中）→ ongoing（进行中）→ completed（已完成）
                                     → cancelled（已取消）
```

### Trip Itinerary（行程单）
```
draft（草稿）→ confirmed（用户确认）
            → modified（用户修改后）
```

## 行程规划安全规则

1. **确认后再创建**：在将行程写入系统前，必须先向用户展示完整行程方案并获得确认
2. **预算敏感**：搜索机票酒店时，优先推荐经济实惠的选项，并标注价格
3. **政策合规**：创建行程前，先调用 `GET /api/settings/policies` 查看公司差旅政策，确保预估费用在限额内
4. **日历隐私**：读取用户日历时，只提取会议时间、地点、参会人等必要信息，不要展示无关内容

## 行程管理 API

### 11. 创建行程（Trip）

```http
POST {REIMBURSEMENT_API_URL}/api/trips
Content-Type: application/json
```

请求体：
```json
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
```

必填字段：`title`、`startDate`、`endDate`

响应示例：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "北京客户拜访",
    "purpose": "Q2 商务洽谈",
    "destination": "北京",
    "startDate": "2026-03-15T00:00:00.000Z",
    "endDate": "2026-03-17T00:00:00.000Z",
    "status": "planning",
    "budget": { "..." : "..." }
  }
}
```

需要的 scope：`trip:create`

### 12. 查看行程列表

```http
GET {REIMBURSEMENT_API_URL}/api/trips
```

查询参数：
- `status` - 筛选状态：`planning`、`ongoing`、`completed`、`cancelled`

返回行程列表，每个行程包含关联的行程单（itineraries）和行程明细（items）。

需要的 scope：`trip:read`

### 13. 查看行程详情

```http
GET {REIMBURSEMENT_API_URL}/api/trips/{id}
```

返回行程详情，包含：
- 行程基本信息
- 关联的所有行程单（itineraries）+ 明细
- 关联的报销单（reimbursements）

需要的 scope：`trip:read`

### 14. 更新行程

```http
PUT {REIMBURSEMENT_API_URL}/api/trips/{id}
Content-Type: application/json
```

支持部分更新，只传需要修改的字段：
```json
{
  "status": "ongoing",
  "destination": "北京, 上海"
}
```

需要的 scope：`trip:create`

### 15. 创建行程单（Itinerary）

行程单是 Trip 的详细日程安排，包含每天每个时间段的具体活动。

```http
POST {REIMBURSEMENT_API_URL}/api/trip-itineraries
Content-Type: application/json
```

请求体：
```json
{
  "tripId": "关联的行程ID",
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
      "time": "12:00",
      "type": "meal",
      "category": "meal",
      "title": "午餐",
      "location": "北京国贸",
      "amount": 80,
      "currency": "CNY",
      "sortOrder": 1
    },
    {
      "date": "2026-03-15",
      "time": "14:00",
      "type": "meeting",
      "title": "与 XX 公司 Q2 商务洽谈",
      "description": "参会人：张三、李四",
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
    },
    {
      "date": "2026-03-17",
      "time": "17:00",
      "type": "transport",
      "category": "flight",
      "title": "北京首都 → 上海浦东 MU5102",
      "description": "东方航空经济舱",
      "departure": "北京首都T2",
      "arrival": "上海浦东T1",
      "transportNumber": "MU5102",
      "amount": 1200,
      "currency": "CNY",
      "sortOrder": 10
    }
  ]
}
```

**行程明细 item 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `date` | ✅ | 日期 YYYY-MM-DD |
| `time` | | 时间 HH:mm |
| `type` | ✅ | 类型：`transport` / `hotel` / `meal` / `meeting` / `other` |
| `category` | | 费用类别（与报销类别对应）：`flight` / `train` / `hotel` / `meal` / `taxi` 等 |
| `title` | ✅ | 节点标题 |
| `description` | | 详细描述 |
| `location` | | 地点 |
| `departure` | | 出发地（交通类） |
| `arrival` | | 到达地（交通类） |
| `transportNumber` | | 航班号/车次 |
| `hotelName` | | 酒店名称 |
| `checkIn` | | 入住日期（酒店类） |
| `checkOut` | | 退房日期（酒店类） |
| `amount` | | 预估金额 |
| `currency` | | 币种 |
| `sortOrder` | | 排序号（同日期内排序） |

需要的 scope：`trip:create`

### 16. 查看行程单列表

```http
GET {REIMBURSEMENT_API_URL}/api/trip-itineraries
```

查询参数：
- `tripId` - 按行程筛选
- `reimbursementId` - 按报销单筛选

需要的 scope：`trip:read`

### 17. 查看行程单详情

```http
GET {REIMBURSEMENT_API_URL}/api/trip-itineraries/{id}
```

返回行程单详情及所有明细项（items）。

需要的 scope：`trip:read`

### 18. 更新行程单

```http
PUT {REIMBURSEMENT_API_URL}/api/trip-itineraries/{id}
Content-Type: application/json
```

支持部分更新主信息。如果传了 `items` 数组，会**全量替换**所有明细。

**确认行程单**（用户确认后）：
```json
{
  "status": "confirmed"
}
```

**关联报销单**：
```json
{
  "reimbursementId": "报销单ID"
}
```

需要的 scope：`trip:create`

### 19. 删除行程单

```http
DELETE {REIMBURSEMENT_API_URL}/api/trip-itineraries/{id}
```

级联删除所有明细项。需要的 scope：`trip:create`

---

## 典型对话流程 - 差旅行程规划

### 用户："我下周三到周五要去北京见客户，帮我安排下行程"

1. 确认细节：出发城市、会议时间/地点、预算偏好
2. 查询公司差旅政策：`GET /api/settings/policies`
3. 搜索航班和酒店（使用你自己的搜索能力）
4. 向用户展示 2-3 个方案（经济/舒适），标注价格和政策合规情况
5. 用户确认后：
   - 创建 Trip：`POST /api/trips`
   - 创建 Itinerary：`POST /api/trip-itineraries`（status=draft）
   - 向用户展示完整行程，请求最终确认
   - 确认后更新状态：`PUT /api/trip-itineraries/{id}` → status=confirmed
6. 创建预估报销单：`POST /api/reimbursements`（status=draft），items 中包含机票、酒店等预估费用
7. 将报销单关联到行程单：`PUT /api/trip-itineraries/{id}` → reimbursementId
8. 询问是否直接提交审批：`PUT /api/reimbursements/{id}` → status=pending

### 用户："帮我看看日历上下周有什么安排，然后规划出差"

1. 读取用户日历（使用你的日历访问能力），提取：
   - 会议时间、地点、参会人
   - 出差城市和日期范围
2. 根据会议安排，自动推算需要的交通和住宿
3. 搜索机票和酒店
4. 生成完整行程方案，展示给用户
5. 确认后写入系统（同上流程）

### 用户："把我那个北京出差的行程改一下，酒店换成全季"

1. 查询行程：`GET /api/trips?status=planning`
2. 找到北京出差行程，获取行程单：`GET /api/trip-itineraries?tripId={id}`
3. 搜索全季酒店价格
4. 展示修改方案给用户确认
5. 更新行程单：`PUT /api/trip-itineraries/{id}` 替换酒店相关 item

### 用户："我的北京出差行程批了吗？"

1. 查询行程关联的报销单：`GET /api/trips/{id}`（返回含 reimbursements）
2. 展示报销单审批状态
3. 如果被驳回，展示原因并协助修改重新提交

## 审批提醒

OpenClaw 可以帮助审批人查看待审批的报销单，并通过 Telegram 发送提醒。

**所需权限**：审批相关操作需要以下 scope 和角色：

| Scope | 说明 | 所需角色 |
|-------|------|----------|
| `approval:read` | 查看待审批报销单 | manager, admin, super_admin |
| `approval:approve` | 批准/驳回报销单 | manager, super_admin |

创建 API Key 时，可选择「审批管理」预设一键配置以上权限。

### 20. 查看待审批报销单

```http
GET {REIMBURSEMENT_API_URL}/api/approvals/pending
```

返回当前用户（API Key 绑定的用户）作为审批人的待审批报销单列表。

需要的 scope：`approval:read`

响应示例：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "3月北京出差报销",
      "totalAmount": 5200,
      "totalAmountInBaseCurrency": 720,
      "baseCurrency": "CNY",
      "status": "pending",
      "submittedAt": "2026-03-15T10:00:00Z",
      "waitingDays": 4,
      "submitter": {
        "id": "uuid",
        "name": "张三",
        "email": "zhangsan@example.com"
      },
      "approvalStep": {
        "stepOrder": 1,
        "stepType": "manager",
        "stepName": "直属上级审批",
        "assignedAt": "2026-03-15T10:00:00Z"
      }
    }
  ],
  "meta": { "total": 1 }
}
```

### 20a. 定时轮询待审批报销单（推荐）

```http
GET {REIMBURSEMENT_API_URL}/api/approvals/pending-poll
```

功能与 `GET /api/approvals/pending` 相同，但专为 OpenClaw 定时抓取设计。

**频率限制**：同一 API Key **每小时最多请求 1 次**。超频会返回 429：
```json
{
  "success": false,
  "error": "轮询频率限制：每小时最多 1 次。请 3420 秒后重试。",
  "error_code": "POLL_RATE_LIMITED",
  "retry_after_seconds": 3420
}
```

响应 header 包含 `Retry-After` 字段（秒数），请据此安排下次轮询。

成功响应额外包含 `meta.next_poll_allowed_at`（ISO 时间），标明下次可请求的时间。

需要的 scope：`approval:read`

**推荐用法**：OpenClaw 设置定时任务，每小时调用一次此端点，有新的待审批报销时通过 Telegram 通知审批人。

### 21. 触发审批提醒（Telegram）

```http
GET {REIMBURSEMENT_API_URL}/api/cron/approval-reminder
```

手动触发一次审批提醒，系统会查找所有待审批的报销单，并通过 Telegram 通知对应的审批人。

**前置条件：**
- 服务器已配置 `TELEGRAM_BOT_TOKEN`
- 审批人的用户资料中已绑定 `telegramChatId`

认证方式：`Authorization: Bearer <CRON_SECRET>` 或 API Key

响应示例：
```json
{
  "success": true,
  "message": "已发送 2 条审批提醒",
  "notified": 2,
  "totalPending": 5,
  "details": [
    {
      "approverId": "uuid",
      "approverName": "李经理",
      "pendingCount": 3,
      "sent": true
    },
    {
      "approverId": "uuid",
      "approverName": "王总监",
      "pendingCount": 2,
      "sent": true
    }
  ]
}
```

## 典型对话流程 - 审批提醒

### 用户："帮我看看有没有待审批的报销单"

1. 调用 `GET /api/approvals/pending` 查询待审批列表
2. 格式化展示：报销标题、提交人、金额、等待天数
3. 提示用户可以前往系统审批

### 用户："提醒一下审批人赶紧审批"

1. 调用 `GET /api/cron/approval-reminder` 触发 Telegram 提醒
2. 告知用户提醒已发送，展示发送结果

---

## 错误处理

所有错误响应格式：
```json
{
  "success": false,
  "error": "人类可读的错误描述",
  "error_code": "MACHINE_READABLE_CODE"
}
```

- `error` 字段是字符串，可以直接展示给用户
- `error_code` 字段是机器可读的错误码，用于程序化判断错误类型

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
| 429 | `POLL_RATE_LIMITED` | 轮询频率超限（每小时 1 次） | 读取 `retry_after_seconds` 或 `Retry-After` 头，等待后重试 |
| 500 | - | 服务器错误 | 建议稍后重试 |
