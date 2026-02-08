# AI助手增强方案

## 🎯 目标

将当前基于关键词匹配的简单AI助手升级为**真正智能的LLM驱动助手**，具备：
- 自然语言理解能力
- 深度数据分析能力
- 上下文记忆能力
- 动态工具调用能力

## 📊 当前问题

### 现状
```typescript
// 当前实现：关键词匹配
if (lowerText.includes('技术') || lowerText.includes('费用')) {
  // 硬编码的逻辑
}
```

### 局限性
1. ❌ **无法理解复杂问题**：只能识别预定义的关键词
2. ❌ **缺乏上下文**：无法记住对话历史
3. ❌ **分析肤浅**：只能输出模板化的响应
4. ❌ **不够灵活**：无法处理变化的查询方式
5. ❌ **没有洞察**：不能生成真正的分析见解

## 🚀 解决方案：集成Claude/OpenAI

### 架构设计

```
用户输入
  ↓
LLM (Claude/OpenAI)
  ├─→ 理解意图
  ├─→ 提取参数
  ├─→ 决定调用哪些工具
  ↓
工具调用
  ├─→ fetchTechExpenses()
  ├─→ executeSkill()
  ├─→ fetchPolicies()
  ↓
LLM再次处理
  ├─→ 分析数据
  ├─→ 生成洞察
  ├─→ 格式化响应
  ↓
用户看到智能回复
```

### 核心功能

#### 1. 工具调用 (Function Calling)

定义工具：
```typescript
const tools = [
  {
    name: "analyze_expenses",
    description: "分析技术费用数据，支持单月或多月对比",
    parameters: {
      type: "object",
      properties: {
        months: {
          type: "array",
          items: { type: "integer" },
          description: "要分析的月份，如[11, 12]"
        },
        year: {
          type: "integer",
          description: "年份，如2025"
        },
        scope: {
          type: "string",
          enum: ["personal", "team", "company"],
          description: "分析范围"
        },
        focusCategory: {
          type: "string",
          enum: ["ai_token", "cloud_resource", "software"],
          description: "重点关注的类别"
        }
      }
    }
  },
  {
    name: "check_budget_alert",
    description: "检查预算预警"
  },
  {
    name: "detect_anomalies",
    description: "检测异常消费"
  },
  {
    name: "analyze_timeliness",
    description: "分析报销时效性"
  }
];
```

#### 2. 上下文记忆

```typescript
interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  userData: {
    recentQueries: string[];
    preferences: {
      preferredScope: string;
      focusCategories: string[];
    };
  };
}
```

#### 3. 智能分析

LLM可以：
- 识别数据中的异常模式
- 生成商业洞察
- 提供个性化建议
- 比较不同时期的趋势
- 预测未来支出

### 实现代码

#### 创建新的LLM驱动助手

```typescript
// src/lib/ai/llm-assistant.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function processWithLLM(
  userMessage: string,
  conversationHistory: Message[],
  availableTools: Tool[]
): Promise<{
  response: string;
  toolCalls?: ToolCall[];
  data?: any;
}> {
  const messages = [
    ...conversationHistory.map(m => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: 'user',
      content: userMessage,
    }
  ];

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system: `你是Fluxa智能报销助手，擅长：
1. 费用数据分析和趋势识别
2. 预算管理和成本优化建议
3. 异常消费检测
4. 报销政策解答

当前日期：${new Date().toISOString()}

你可以调用以下工具获取数据：
${JSON.stringify(availableTools, null, 2)}

分析数据时请：
- 识别关键趋势和异常
- 提供可执行的建议
- 使用表格和图表（markdown格式）
- 突出重要发现`,
    messages,
    tools: availableTools,
  });

  // 处理工具调用
  if (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (toolUse) {
      return {
        response: '',
        toolCalls: [toolUse],
        data: null,
      };
    }
  }

  // 提取文本响应
  const textContent = response.content.find(c => c.type === 'text');
  return {
    response: textContent?.text || '',
    toolCalls: undefined,
    data: null,
  };
}
```

#### 工具执行器

```typescript
// src/lib/ai/tool-executor.ts
export async function executeTool(
  toolName: string,
  params: any,
  context: { userId: string; tenantId: string }
): Promise<any> {
  switch (toolName) {
    case 'analyze_expenses':
      return await analyzeExpenses(params, context);

    case 'check_budget_alert':
      return await executeSkill('builtin_budget_alert');

    case 'detect_anomalies':
      return await executeSkill('builtin_anomaly_detector');

    case 'analyze_timeliness':
      return await executeSkill('builtin_timeliness_analysis');

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function analyzeExpenses(params: any, context: any) {
  const { months, year, scope, focusCategory } = params;

  // 调用现有的fetchTechExpenses API
  const results = [];
  for (const month of months) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const response = await fetch(
      `/api/analytics/tech-expenses?` +
      `scope=${scope}&` +
      `period=custom&` +
      `startDate=${startDate.toISOString().split('T')[0]}&` +
      `endDate=${endDate.toISOString().split('T')[0]}`
    );

    const data = await response.json();
    results.push({
      month: `${year}年${month}月`,
      data: data.data,
    });
  }

  return results;
}
```

#### 更新Chat页面

```typescript
// src/app/(dashboard)/dashboard/chat/page.tsx
import { processWithLLM, executeTool } from '@/lib/ai';

const sendMessage = async (text?: string) => {
  const messageText = text || input;
  if (!messageText.trim() || isLoading) return;

  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: messageText,
    timestamp: new Date(),
  };

  setMessages(prev => [...prev, userMessage]);
  setInput('');
  setIsLoading(true);

  try {
    // 使用LLM处理
    let result = await processWithLLM(
      messageText,
      messages,
      availableTools
    );

    // 如果LLM请求调用工具
    if (result.toolCalls) {
      const toolResults = [];
      for (const toolCall of result.toolCalls) {
        const toolResult = await executeTool(
          toolCall.name,
          toolCall.input,
          { userId: session.user.id, tenantId: user.tenantId }
        );
        toolResults.push(toolResult);
      }

      // 将工具结果返回给LLM进行最终分析
      result = await processWithLLM(
        messageText,
        [
          ...messages,
          userMessage,
          {
            role: 'assistant',
            content: JSON.stringify(toolResults),
          }
        ],
        availableTools
      );
    }

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: result.response,
      timestamp: new Date(),
      data: result.data,
    };

    setMessages(prev => [...prev, assistantMessage]);
  } catch (error) {
    console.error('LLM error:', error);
    // 错误处理
  } finally {
    setIsLoading(false);
  }
};
```

### 示例对话

#### 用户输入
```
"帮我分析一下去年11月和12月的AI费用，
看看有什么异常，以及是否有优化空间"
```

#### LLM处理流程

1. **理解意图**：
   - 需要分析11月和12月
   - 重点是AI费用
   - 需要检测异常
   - 需要提供优化建议

2. **调用工具**：
   ```json
   {
     "tool": "analyze_expenses",
     "params": {
       "months": [11, 12],
       "year": 2025,
       "scope": "company",
       "focusCategory": "ai_token"
     }
   }
   ```

3. **获取数据后的分析**：
   ```markdown
   # 2025年11-12月AI费用分析报告

   ## 📊 总体情况

   | 月份 | AI费用 | 环比变化 | 主要供应商 |
   |------|--------|---------|-----------|
   | 11月 | $1,250 | - | OpenAI (65%) |
   | 12月 | $1,580 | +26.4% | OpenAI (70%) |

   ## 🔍 关键发现

   1. **费用增长显著**：12月较11月增长26.4%，主要驱动因素：
      - OpenAI使用量增加35%
      - 新增Cursor订阅 ($50/月)

   2. **供应商集中度高**：OpenAI占比70%，存在供应商锁定风险

   3. ⚠️ **异常检测**：
      - 12月15日有一笔$350的OpenAI消费，是平均日消费的7倍
      - 建议核实是否为正常业务需求

   ## 💡 优化建议

   1. **成本优化**（预计节省20-30%）：
      - 评估Anthropic Claude作为OpenAI的替代方案
      - Claude在某些场景下成本更低且性能相当
      - 建议先进行A/B测试

   2. **使用监控**：
      - 设置每日消费上限告警
      - 按项目/用户追踪使用量
      - 识别低效使用模式

   3. **供应商分散**：
      - 不要将所有工作负载放在单一供应商
      - 建议分配：OpenAI 60% + Anthropic 30% + 开源模型 10%

   ## 📈 预测

   基于当前趋势，预计1月份AI费用将达到$1,900左右。
   建议在月初设定预算上限。
   ```

## 🎯 优势对比

### Before (关键词匹配)
```
用户："帮我分析11月12月的AI费用"
系统：[硬编码逻辑] → 显示数据表格
      没有分析，没有洞察
```

### After (LLM驱动)
```
用户："帮我分析11月12月的AI费用"
LLM：理解意图 → 调用工具 → 深度分析 → 生成洞察
     - 识别异常模式
     - 提供可执行建议
     - 预测未来趋势
     - 个性化优化方案
```

## 📦 实施步骤

### Phase 1: 基础集成 (1-2天)
1. 安装Anthropic SDK
2. 添加API密钥配置
3. 创建LLM处理器
4. 实现工具调用机制

### Phase 2: 工具定义 (1天)
1. 定义所有可用工具
2. 实现工具执行器
3. 测试工具调用流程

### Phase 3: 前端集成 (1天)
1. 更新Chat组件
2. 处理流式响应
3. 添加加载状态

### Phase 4: 优化增强 (2-3天)
1. 添加对话历史记忆
2. 实现用户偏好学习
3. 优化提示词
4. 添加缓存机制

## 💰 成本估算

### Claude API定价
- Input: $3 / 1M tokens
- Output: $15 / 1M tokens

### 预估成本
- 平均对话：~500 input + 1000 output tokens
- 单次对话成本：~$0.017
- 100次对话/天：~$1.7/天 = $51/月

**性价比极高！**相比雇佣分析师，这个成本几乎可以忽略。

## 🚀 预期效果

1. **理解能力** ↑ 1000%：可以理解各种自然语言表达
2. **分析深度** ↑ 500%：生成真正的商业洞察
3. **用户满意度** ↑ 300%：智能、有用的回复
4. **使用频率** ↑ 200%：成为用户日常依赖的工具

## 📝 下一步

如果要实施此方案，我可以：
1. 创建完整的实现代码
2. 添加配置和环境变量
3. 实现流式响应
4. 添加错误处理和降级策略
5. 编写测试用例

是否开始实施？
