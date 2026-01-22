# Reimbursement Agent

智能报销 Portal 系统 - AI-Native 的企业报销管理平台

## 功能特性

### 🤖 智能 Agent 能力

- **邮件收集 Agent**: 自动从邮箱提取差旅预订确认（机票、酒店、火车票）
- **日历识别 Agent**: 从日历事件识别出差行程
- **票据解析 Agent**: OCR 识别发票，自动提取金额、日期、商家信息
- **行程管理 Agent**: 根据报销自动生成行程记录，检查材料完整性
- **合规检查 Agent**: 自动检查费用是否符合公司政策
- **预算预估 Agent**: 基于历史数据和政策预估出差预算

### 💼 核心功能

- 多租户 SaaS 架构，支持企业内部使用和对外服务
- 完整的报销流程（创建、审批、支付）
- 多级审批工作流
- 多币种支持，自动汇率转换
- 与财务 COA（科目表）对接
- FluxPay MCP 集成实现自动打款

### 📊 费用类别

支持丰富的费用类别，与财务科目对应：

- **差旅费用**: 机票、火车票、酒店、餐饮、交通
- **技术费用**: AI Token 消耗、云资源、API 服务、域名
- **行政费用**: 快递、打印、通讯、网络
- **业务费用**: 客户招待、培训、会议

### 🔧 智能特性

- **预算预估**: AI 根据行程和历史数据预估预算
- **自动分类**: 智能识别费用类别
- **合规建议**: 实时政策检查和优化建议
- **缺失提醒**: 自动检测并提醒缺失的票据
- **Chat 定义政策**: 通过自然语言定义报销政策

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **数据库**: PostgreSQL + Drizzle ORM
- **AI**: Claude API (Anthropic)
- **支付**: FluxPay MCP
- **UI**: shadcn/ui + Tailwind CSS

## 项目结构

```
src/
├── app/                    # Next.js 页面和 API
├── agents/                 # AI Agent 模块
│   ├── orchestrator.ts     # 主协调器
│   ├── budget-estimator.ts # 预算预估
│   └── index.ts
├── lib/
│   ├── coa/               # COA 科目映射
│   ├── currency/          # 货币转换服务
│   ├── db/                # 数据库 Schema
│   ├── policy/            # 政策规则引擎
│   └── prompts/           # Sample Prompts
└── types/                 # TypeScript 类型定义
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

### 3. 初始化数据库

```bash
npm run db:push
```

### 4. 启动开发服务器

```bash
npm run dev
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `ANTHROPIC_API_KEY` | Claude API 密钥 |
| `FLUXPAY_API_KEY` | FluxPay 支付 API 密钥 |
| `GOOGLE_CLIENT_ID` | Google OAuth 客户端 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 密钥 |
| `EXCHANGE_RATE_API_KEY` | 汇率 API 密钥 |

## 使用示例

### 通过 Chat 创建报销

```
用户: 我刚从上海出差回来，帮我整理报销

Agent: 我来帮你整理上海出差的报销。让我先检查一下相关信息...

[自动收集邮件中的机票、酒店确认]
[识别日历中的出差日程]
[检查已有票据]

已找到以下费用：
- 机票（往返）: ¥2,630
- 酒店（2晚）: ¥900
- 餐饮: ¥245
- 市内交通: ¥120

缺少 1/16 晚餐票据，需要补充吗？
```

### 通过 Chat 定义政策

```
用户: 帮我创建一个差旅报销政策：机票经济舱最高2000元，一线城市酒店每晚不超过800元

Agent: 好的，我来帮你创建差旅报销政策：

✅ 已创建规则：
1. 国内机票限额 - 经济舱单程不超过 ¥2,000
2. 一线城市酒店限额 - 每晚不超过 ¥800

⚠️ 建议补充以下规则：
- 其他城市的酒店限额
- 餐饮每日限额
- 市内交通限额

需要我帮你补充这些规则吗？
```

## 开发计划

- [x] Phase 1: 基础框架和数据模型
- [ ] Phase 2: 票据 OCR 和自动分类
- [ ] Phase 3: 邮件和日历集成
- [ ] Phase 4: 智能行程管理
- [ ] Phase 5: 合规检查和预算预估
- [ ] Phase 6: 多租户 SaaS 功能

## License

MIT
