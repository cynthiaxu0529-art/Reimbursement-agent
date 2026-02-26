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
  version: '1.0.0',
  description: '企业报销管理 - 帮助用户提交报销、上传发票、查询报销状态、查看政策和分析费用',
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

## 可用操作

### 1. 查看我的报销单

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
      "items": [...]
    }
  ]
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

费用类别（category）可选值：
- \`flight\` - 机票
- \`hotel\` - 酒店
- \`train\` - 火车票
- \`taxi\` - 出租车/网约车
- \`meal\` - 餐饮
- \`transport\` - 市内交通
- \`office_supplies\` - 办公用品
- \`software\` - 软件/订阅
- \`equipment\` - 设备
- \`phone\` - 通讯费
- \`other\` - 其他

状态说明：
- \`"status": "draft"\` - 仅保存草稿（推荐，让用户确认后再提交）
- \`"status": "pending"\` - 直接提交审批（需要 \`reimbursement:submit\` scope）

### 3. 上传票据/发票

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/upload
Content-Type: multipart/form-data
\`\`\`

表单字段：
- \`file\` - 图片文件（支持 jpg, png, pdf）

上传后会返回票据 URL，可以在创建报销时关联：
\`\`\`json
{
  "success": true,
  "url": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg"
}
\`\`\`

### 4. OCR 识别发票

\`\`\`http
POST {REIMBURSEMENT_API_URL}/api/ocr
Content-Type: application/json
\`\`\`

\`\`\`json
{
  "imageUrl": "https://xxx.blob.vercel-storage.com/receipt-xxx.jpg"
}
\`\`\`

返回发票识别结果，可用于自动填充报销明细。

### 5. 查看报销政策

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/settings/policies
\`\`\`

返回公司报销政策规则，包括各类别的限额。提交报销前建议先查询政策。

### 6. 查看费用分析

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/analytics/expenses
\`\`\`

### 7. 查看个人信息

\`\`\`http
GET {REIMBURSEMENT_API_URL}/api/settings/profile
\`\`\`

## 典型对话流程

### 用户："帮我报销昨天的打车费 45 元"

1. 确认信息：日期、金额、类别、供应商
2. 查询政策确认是否在限额内
3. 展示报销摘要让用户确认
4. 创建报销单（先存草稿）
5. 询问用户是否直接提交审批

### 用户："帮我看看上个月的报销状态"

1. 调用 GET /api/reimbursements 查询列表
2. 格式化展示：标题、金额、状态、日期
3. 如果有被拒绝的，提醒用户查看原因

### 用户："帮我报销这张发票"（附带图片）

1. 上传图片到 /api/upload
2. 调用 /api/ocr 识别发票内容
3. 展示识别结果让用户确认
4. 根据识别结果自动创建报销单（草稿）
5. 让用户确认后提交

## 错误处理

| 状态码 | 含义 | 建议操作 |
|--------|------|---------|
| 401 | API Key 无效或过期 | 提醒用户重新配置 API Key |
| 403 | 权限不足（scope 不够） | 告知用户需要哪个权限 |
| 400 | 请求参数错误 | 根据 error 字段提示用户修正 |
| 500 | 服务器错误 | 建议稍后重试 |
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
      endpoints: [
        { method: 'GET', path: '/api/reimbursements', scope: 'reimbursement:read', description: '查看报销单列表' },
        { method: 'POST', path: '/api/reimbursements', scope: 'reimbursement:create', description: '创建报销单' },
        { method: 'POST', path: '/api/upload', scope: 'receipt:upload', description: '上传票据' },
        { method: 'POST', path: '/api/ocr', scope: 'receipt:upload', description: 'OCR 识别发票' },
        { method: 'GET', path: '/api/settings/policies', scope: 'policy:read', description: '查看报销政策' },
        { method: 'GET', path: '/api/analytics/expenses', scope: 'analytics:read', description: '查看费用分析' },
        { method: 'GET', path: '/api/settings/profile', scope: 'profile:read', description: '查看个人信息' },
      ],
      available_scopes: [
        'reimbursement:read', 'reimbursement:create', 'reimbursement:update',
        'reimbursement:submit', 'reimbursement:cancel',
        'receipt:read', 'receipt:upload',
        'policy:read', 'trip:read', 'trip:create',
        'analytics:read', 'profile:read', 'settings:read',
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
