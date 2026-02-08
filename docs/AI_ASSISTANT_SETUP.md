# AI助手设置指南

本文档介绍如何配置和使用基于OpenRouter的智能AI助手。

## 🌟 功能特性

AI助手现在使用真正的LLM (Claude 3.5 Sonnet)来理解用户意图，并智能调用分析工具：

- ✅ **自然语言理解**：无需记忆固定命令，用自然语言提问
- ✅ **智能工具调用**：自动判断需要哪些数据和分析
- ✅ **上下文记忆**：记住对话历史，支持多轮对话
- ✅ **深度分析**：生成真正的商业洞察和建议
- ✅ **多月对比**：智能识别"11月和12月"等时间表达

## 📋 配置步骤

### 1. 获取OpenRouter API密钥

1. 访问 [OpenRouter](https://openrouter.ai/)
2. 注册/登录账号
3. 进入 [API Keys](https://openrouter.ai/keys) 页面
4. 创建新的API密钥
5. 充值账户（推荐 $10-20 起步）

### 2. 配置环境变量

在项目根目录的 `.env` 文件中添加：

```bash
# OpenRouter API配置
OPENROUTER_API_KEY="sk-or-v1-xxxxx"  # 你的API密钥
OPENROUTER_APP_URL="http://localhost:3000"  # 开发环境
OPENROUTER_APP_NAME="Fluxa智能报销"
```

生产环境修改为：
```bash
OPENROUTER_APP_URL="https://yourdomain.com"
```

### 3. 重启开发服务器

```bash
npm run dev
```

## 💰 成本估算

### OpenRouter定价（使用 Claude 3.5 Sonnet）

- **输入 (Input)**: $3 / 1M tokens
- **输出 (Output)**: $15 / 1M tokens

### 实际使用成本

假设一次完整的对话：
- 用户问题：~50 tokens
- 系统提示词：~500 tokens
- 工具定义：~1000 tokens
- 工具返回数据：~2000 tokens
- AI分析回复：~1000 tokens

**单次对话成本：**
- Input: (50 + 500 + 1000 + 2000) × $3 / 1M = $0.0107
- Output: 1000 × $15 / 1M = $0.015
- **总计：约 $0.026/次**

**月度成本估算：**
- 100次对话/天 × 30天 = 3000次/月
- 成本：3000 × $0.026 = **$78/月**

如果降低使用频率到 30次/天：
- 30 × 30 = 900次/月
- 成本：900 × $0.026 = **$23.4/月**

**性价比极高！** 远低于雇佣一个数据分析师的成本。

## 🛠️ 可用工具

AI助手可以调用以下分析工具：

### 1. analyze_expenses
分析技术费用，支持：
- 单月或多月对比
- 按类别筛选
- 个人/团队/公司范围

### 2. check_budget_alert
检查预算使用情况：
- 当前使用率
- 超支风险预警
- 预计耗尽时间

### 3. detect_anomalies
检测异常消费模式：
- 突然的大额支出
- 频繁的重复扣费
- 未知供应商
- 消费趋势突变

### 4. analyze_timeliness
分析报销时效性：
- 平均提交间隔
- 延迟报销分布
- 跨期报销识别

### 5. search_policies
查询报销政策：
- 类别限额
- 审批流程
- 单据要求

## 📊 使用示例

### 示例1：多月对比分析

**用户：** "帮我分析11月和12月的AI费用"

**AI助手：**
1. 理解：需要分析2个月的AI Token费用
2. 调用：`analyze_expenses(months=[11,12], year=2025, focusCategory='ai_token')`
3. 分析：对比两个月的数据
4. 回复：生成详细的对比报告，包括：
   - 总费用对比表格
   - 环比增长分析
   - 供应商分布变化
   - 优化建议

### 示例2：异常检测

**用户：** "最近有没有什么异常消费？"

**AI助手：**
1. 理解：需要检测异常
2. 调用：`detect_anomalies(scope='company', period='month')`
3. 分析：识别异常模式
4. 回复：列出检测到的异常，如：
   - 12月15日OpenAI消费异常增高
   - 新增供应商Cursor
   - 建议核实和审查

### 示例3：政策咨询

**用户：** "AI费用怎么报销？需要什么材料？"

**AI助手：**
1. 理解：查询AI费用报销政策
2. 调用：`search_policies(query='AI Token费用', category='ai_token')`
3. 整理：政策信息
4. 回复：
   - 单笔限额
   - 需要的材料
   - 审批流程
   - 注意事项

## 🔧 技术架构

```
用户输入
  ↓
LLM理解意图
  ↓
决定调用工具 → 执行工具获取数据
  ↓
LLM分析数据
  ↓
生成智能回复
```

## 📁 代码文件

- `/src/lib/ai/openrouter-client.ts` - OpenRouter客户端封装
- `/src/lib/ai/tools.ts` - 工具定义（5个分析工具）
- `/src/lib/ai/tool-executor.ts` - 工具执行器
- `/src/app/api/ai/chat/route.ts` - AI聊天API端点
- `/src/app/(dashboard)/dashboard/chat/page.tsx` - 聊天界面

## 🐛 故障排查

### 问题1：API密钥错误

**错误信息：** "AI服务配置错误，请检查API密钥"

**解决方案：**
1. 检查 `.env` 文件中的 `OPENROUTER_API_KEY`
2. 确认密钥格式正确：`sk-or-v1-xxxxx`
3. 在 OpenRouter 网站确认密钥有效
4. 重启开发服务器

### 问题2：工具调用失败

**错误信息：** "Tool execution failed"

**解决方案：**
1. 检查相关API端点是否正常运行
2. 查看浏览器控制台的详细错误
3. 确认数据库连接正常
4. 检查 skill 是否正确注册

### 问题3：回复很慢

**可能原因：**
- LLM处理需要时间（通常3-10秒）
- 多次工具调用会延长时间
- 网络延迟

**优化建议：**
- 正常现象，无需特殊处理
- 添加了"正在思考"加载提示
- 未来可以实现流式响应

## 🚀 下一步优化

1. **流式响应**：实时显示AI回复，而不是等待完成
2. **缓存机制**：缓存常见问题的回复
3. **用户偏好学习**：记住用户的分析偏好
4. **更多工具**：添加预测、预算规划等工具
5. **多模型支持**：根据任务复杂度选择不同模型

## 📞 支持

如有问题，请：
1. 查看本文档的故障排查部分
2. 检查浏览器控制台的错误信息
3. 查看 OpenRouter 的 [API文档](https://openrouter.ai/docs)
4. 联系开发团队

## 📝 更新日志

### 2026-02-08 - v1.0.0
- ✅ 集成 OpenRouter API
- ✅ 实现 Function Calling
- ✅ 5个核心分析工具
- ✅ 简化的聊天界面
- ✅ 上下文记忆支持
