# Vercel 部署指南

本项目使用 Vercel 进行云部署。本文档介绍如何部署和配置 AI 助手功能。

## 🚀 快速部署

### 首次部署

1. **连接 GitHub 仓库到 Vercel**
   - 访问 [Vercel Dashboard](https://vercel.com/dashboard)
   - 点击 **Add New... → Project**
   - 选择你的 GitHub 仓库：`cynthiaxu0529-art/Reimbursement-agent`
   - 点击 **Import**

2. **配置项目设置**
   - **Framework Preset**: Next.js（自动检测）
   - **Root Directory**: `./`（默认）
   - **Build Command**: `npm run build`（默认）
   - **Output Directory**: `.next`（默认）

3. **配置环境变量**（必需）

   在 **Environment Variables** 部分添加：

   | 变量名 | 值 | 说明 |
   |--------|---|------|
   | `POSTGRES_URL` | `postgresql://...` | 从 Vercel Postgres 获取 |
   | `AUTH_SECRET` | `生成的随机字符串` | 运行 `openssl rand -base64 32` |
   | `OPENROUTER_API_KEY` | `sk-or-v1-xxxxx` | OpenRouter API 密钥 |
   | `BLOB_READ_WRITE_TOKEN` | `vercel_blob_...` | Vercel Blob 存储 |
   | `RESEND_API_KEY` | `re_xxxxxxxxxx` | Resend 邮件服务 |

   **注意**：
   - 所有环境变量选择 **Production, Preview, Development**
   - `OPENROUTER_APP_URL` 不需要设置（自动检测）

4. **点击 Deploy** 🚀

---

## 🔧 配置 OpenRouter AI 功能

### 步骤 1：获取 OpenRouter API 密钥

1. 访问 https://openrouter.ai/
2. 注册并登录
3. 进入 https://openrouter.ai/keys
4. 创建新密钥（Create Key）
5. 充值账户：
   - 点击 **Credits**
   - 充值 $10-20（推荐新手起步金额）
   - 支持信用卡/PayPal

### 步骤 2：在 Vercel 中配置

1. 进入 Vercel 项目页面
2. **Settings** → **Environment Variables**
3. 添加变量：

```
Name: OPENROUTER_API_KEY
Value: sk-or-v1-你的密钥
Environments: ✓ Production ✓ Preview ✓ Development
```

4. 添加应用名称（可选）：

```
Name: OPENROUTER_APP_NAME
Value: Fluxa智能报销
Environments: ✓ Production ✓ Preview ✓ Development
```

5. **保存**

### 步骤 3：重新部署

**重要**：添加环境变量后必须重新部署！

方式一（Dashboard）：
1. **Deployments** 标签
2. 选择最新的部署
3. 点击右上角 **⋯ → Redeploy**
4. 确认 **Redeploy**

方式二（Git Push）：
```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push
```

### 步骤 4：验证功能

1. 等待部署完成（~2-3分钟）
2. 访问你的域名：`https://your-app.vercel.app`
3. 登录系统
4. 进入 **AI 助手** (`/dashboard/chat`)
5. 测试问题："分析本月技术费用"

---

## 📊 监控和日志

### 查看 AI API 调用日志

1. Vercel Dashboard → 你的项目
2. **Functions** 标签
3. 找到 `/api/ai/chat` 函数
4. 点击查看实时日志

### 监控成本

1. OpenRouter Dashboard
2. 查看 **Usage** 页面
3. 设置消费上限（推荐）：
   - **Settings** → **Limits**
   - 设置月度预算上限（如 $50）

---

## 🌍 自定义域名（可选）

### 添加自定义域名

1. Vercel Dashboard → 项目 → **Settings** → **Domains**
2. 输入你的域名（如 `reimbursement.yourcompany.com`）
3. 按照提示配置 DNS：
   - **A Record**: `76.76.21.21`
   - **CNAME**: `cname.vercel-dns.com`
4. 等待 DNS 生效（通常几分钟）

### 更新 OpenRouter 应用 URL

如果使用了自定义域名，更新环境变量：

```
Name: OPENROUTER_APP_URL
Value: https://reimbursement.yourcompany.com
```

然后重新部署。

---

## 🔐 环境变量完整清单

### 必需变量

| 变量 | 说明 | 获取方式 |
|------|------|---------|
| `POSTGRES_URL` | 数据库连接 | Vercel Postgres |
| `AUTH_SECRET` | 认证密钥 | `openssl rand -base64 32` |
| `OPENROUTER_API_KEY` | AI 服务 | openrouter.ai |
| `BLOB_READ_WRITE_TOKEN` | 文件存储 | Vercel Blob |

### 推荐变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENROUTER_APP_NAME` | 应用名称 | "Fluxa智能报销" |
| `RESEND_API_KEY` | 邮件服务 | - |
| `DEFAULT_BASE_CURRENCY` | 基础货币 | "CNY" |

### 不需要设置的变量

- `OPENROUTER_APP_URL` - Vercel 自动提供 `VERCEL_URL`
- `NEXTAUTH_URL` - Vercel 自动检测
- `NODE_ENV` - Vercel 自动设置

---

## 🚨 常见问题

### Q1: 部署后 AI 功能返回 500 错误

**可能原因**：
1. `OPENROUTER_API_KEY` 未设置或格式错误
2. OpenRouter 账户余额不足
3. 环境变量设置后未重新部署

**解决方案**：
1. 检查 Vercel Environment Variables
2. 访问 openrouter.ai 检查余额
3. 重新部署项目

### Q2: 如何查看 AI API 的调用记录？

**方案一（Vercel）**：
- Dashboard → Functions → `/api/ai/chat`
- 查看实时日志和错误

**方案二（OpenRouter）**：
- https://openrouter.ai/activity
- 查看所有 API 调用历史

### Q3: 本地开发如何测试 AI 功能？

创建 `.env.local` 文件（不要提交到 Git）：

```bash
# .env.local
OPENROUTER_API_KEY="sk-or-v1-xxxxx"
POSTGRES_URL="postgresql://..."
AUTH_SECRET="..."
# 其他必需的环境变量...
```

运行：
```bash
npm run dev
```

### Q4: AI 回复很慢（超过 10 秒）

**正常现象**：
- Claude 3.5 Sonnet 处理时间：3-10秒
- 如果调用多个工具，可能需要 10-20秒

**优化建议**：
- 未来可以实现流式响应（Streaming）
- 考虑使用更快的模型（如 GPT-4o-mini）

### Q5: 成本会不会很高？

**典型用量成本**（Claude 3.5 Sonnet）：
- 单次对话：~$0.026
- 30 次/天：$23/月
- 100 次/天：$78/月

**省钱技巧**：
1. 在 OpenRouter 设置月度预算上限
2. 限制团队使用频率
3. 对简单问题使用更便宜的模型

---

## 📈 性能优化

### Edge Functions（推荐）

Vercel 默认使用 Edge Functions，无需额外配置。

### 缓存策略

对于不常变化的数据（如政策查询），可以启用缓存：

```typescript
// src/app/api/ai/chat/route.ts
export const revalidate = 3600; // 缓存 1 小时
```

### 超时设置

AI Chat API 已配置 60 秒超时：

```typescript
export const maxDuration = 60;
```

如果经常超时，可以增加到 300 秒（需要 Vercel Pro）。

---

## 🔄 CI/CD 流程

### 自动部署

每次 push 到 GitHub 自动触发部署：

```bash
git add .
git commit -m "feat: update AI assistant"
git push
```

Vercel 会自动：
1. 检测到 push
2. 运行 `npm run build`
3. 部署到生产环境
4. 运行健康检查

### Preview Deployments

每个 Pull Request 自动创建预览环境：
- 独立的预览 URL
- 使用 Preview 环境变量
- 适合测试新功能

### 回滚

如果新部署有问题：
1. Deployments 标签
2. 选择之前的稳定版本
3. **⋯ → Promote to Production**

---

## 📞 获取帮助

- **Vercel 文档**: https://vercel.com/docs
- **OpenRouter 文档**: https://openrouter.ai/docs
- **项目 Issues**: https://github.com/cynthiaxu0529-art/Reimbursement-agent/issues

---

## ✅ 部署检查清单

部署前确认：

- [ ] GitHub 仓库已连接到 Vercel
- [ ] Vercel Postgres 数据库已创建
- [ ] 所有必需的环境变量已配置
- [ ] OpenRouter API 密钥有效且有余额
- [ ] `OPENROUTER_API_KEY` 已设置
- [ ] 构建成功（Build Status: Success）
- [ ] AI 助手页面可以访问
- [ ] 测试提问返回正常回复

部署后验证：

- [ ] 访问 `https://your-app.vercel.app/dashboard/chat`
- [ ] 测试问题："分析本月技术费用"
- [ ] 检查 Vercel Functions 日志无错误
- [ ] 检查 OpenRouter Activity 有调用记录
- [ ] 确认账单在预期范围内
