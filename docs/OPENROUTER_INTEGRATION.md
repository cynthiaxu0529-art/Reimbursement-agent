# 使用OpenRouter集成LLM智能助手

## 🎯 为什么选择OpenRouter

### 优势
1. **统一API**：一个接口访问所有主流LLM
2. **成本更低**：通常比官方API便宜20-50%
3. **灵活切换**：可以轻松切换不同模型
4. **无需多个API Key**：只需一个OpenRouter密钥
5. **支持模型**：
   - Anthropic Claude (所有版本)
   - OpenAI GPT-4/GPT-3.5
   - Google Gemini
   - Meta Llama
   - 以及100+其他模型

### 定价示例 (OpenRouter)
- Claude 3.5 Sonnet: $3 input / $15 output (per 1M tokens)
- GPT-4 Turbo: $10 input / $30 output
- GPT-3.5 Turbo: $0.50 input / $1.50 output

## 🚀 快速集成指南

### Step 1: 安装依赖

```bash
npm install openai
```

### Step 2: 配置环境变量

```bash
# .env.local
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_APP_URL=https://your-app.com
OPENROUTER_APP_NAME=Fluxa智能报销助手
```

### Step 3: 创建LLM服务

```typescript
// src/lib/ai/openrouter-client.ts
import OpenAI from 'openai';

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_APP_URL,
    'X-Title': process.env.OPENROUTER_APP_NAME,
  },
});

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export async function chatWithAI(
  messages: Message[],
  tools?: Tool[],
  model: string = 'anthropic/claude-3.5-sonnet'
): Promise<{
  content: string;
  toolCalls?: any[];
  finishReason: string;
}> {
  try {
    const completion = await openrouter.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: tools ? 'auto' : undefined,
      temperature: 0.7,
      max_tokens: 4096,
    });

    const choice = completion.choices[0];
    const message = choice.message;

    return {
      content: message.content || '',
      toolCalls: message.tool_calls,
      finishReason: choice.finish_reason,
    };
  } catch (error) {
    console.error('OpenRouter API error:', error);
    throw error;
  }
}

export default openrouter;
```

### Step 4: 定义分析工具

```typescript
// src/lib/ai/tools.ts
export const ANALYSIS_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'analyze_tech_expenses',
      description: '分析技术费用数据，支持单月或多月对比分析',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'array',
            items: { type: 'integer', minimum: 1, maximum: 12 },
            description: '要分析的月份列表，如[11, 12]表示11月和12月',
          },
          year: {
            type: 'integer',
            description: '年份，如2025',
          },
          scope: {
            type: 'string',
            enum: ['personal', 'team', 'company'],
            description: '分析范围：personal=个人，team=团队，company=公司',
            default: 'company',
          },
          categories: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['ai_token', 'cloud_resource', 'api_service', 'software', 'hosting', 'domain'],
            },
            description: '要分析的类别，不指定则分析所有类别',
          },
        },
        required: ['months', 'year'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_budget_alerts',
      description: '检查预算预警，识别接近或超出预算的类别',
      parameters: {
        type: 'object',
        properties: {
          alertLevel: {
            type: 'string',
            enum: ['all', 'warning', 'critical'],
            description: '预警级别：all=所有，warning=警告，critical=严重',
            default: 'all',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detect_anomalies',
      description: '检测异常消费，包括重复提交、高额异常、供应商集中度等',
      parameters: {
        type: 'object',
        properties: {
          sensitivity: {
            type: 'number',
            description: '检测灵敏度（1-5），1=最低，5=最高',
            default: 3,
            minimum: 1,
            maximum: 5,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_timeliness',
      description: '分析报销时效性，统计费用发生到提交的时间间隔',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['month', 'quarter', 'year'],
            description: '统计周期',
            default: 'month',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_policies',
      description: '查询报销政策和规定',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '查询特定类别的政策，如ai_token、meal等',
          },
        },
      },
    },
  },
];
```

### Step 5: 工具执行器

```typescript
// src/lib/ai/tool-executor.ts
export async function executeAnalysisTool(
  toolName: string,
  params: any,
  context: { userId: string; tenantId: string }
): Promise<any> {
  switch (toolName) {
    case 'analyze_tech_expenses':
      return await analyzeTechExpenses(params, context);

    case 'check_budget_alerts':
      return await checkBudgetAlerts(params, context);

    case 'detect_anomalies':
      return await detectAnomalies(params, context);

    case 'analyze_timeliness':
      return await analyzeTimeliness(params, context);

    case 'query_policies':
      return await queryPolicies(params, context);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function analyzeTechExpenses(
  params: { months: number[]; year: number; scope?: string; categories?: string[] },
  context: any
) {
  const { months, year, scope = 'company', categories } = params;

  const results = [];
  for (const month of months) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const url = new URL('/api/analytics/tech-expenses', window.location.origin);
    url.searchParams.set('scope', scope);
    url.searchParams.set('period', 'custom');
    url.searchParams.set('startDate', startDate.toISOString().split('T')[0]);
    url.searchParams.set('endDate', endDate.toISOString().split('T')[0]);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.success) {
      let filteredData = data.data;

      // 如果指定了类别，过滤数据
      if (categories && categories.length > 0) {
        filteredData = {
          ...data.data,
          byCategory: data.data.byCategory.filter((cat: any) =>
            categories.includes(cat.category)
          ),
        };
      }

      results.push({
        month: `${year}年${month}月`,
        data: filteredData,
      });
    }
  }

  return {
    success: true,
    months: results,
  };
}

async function checkBudgetAlerts(params: any, context: any) {
  const response = await fetch('/api/skills/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId: 'builtin_budget_alert' }),
  });

  return await response.json();
}

async function detectAnomalies(params: any, context: any) {
  const response = await fetch('/api/skills/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId: 'builtin_anomaly_detector' }),
  });

  return await response.json();
}

async function analyzeTimeliness(params: any, context: any) {
  const response = await fetch('/api/skills/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId: 'builtin_timeliness_analysis' }),
  });

  return await response.json();
}

async function queryPolicies(params: any, context: any) {
  const url = params.category
    ? `/api/settings/policies?category=${params.category}`
    : '/api/settings/policies';

  const response = await fetch(url);
  return await response.json();
}
```

### Step 6: 创建智能助手API

```typescript
// src/app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { chatWithAI } from '@/lib/ai/openrouter-client';
import { ANALYSIS_TOOLS } from '@/lib/ai/tools';
import { executeAnalysisTool } from '@/lib/ai/tool-executor';

const SYSTEM_PROMPT = `你是Fluxa智能报销助手，专门帮助用户分析费用、管理预算、优化成本。

当前日期：${new Date().toISOString().split('T')[0]}

你的能力：
1. 💰 费用分析：深入分析技术费用，识别趋势和异常
2. 📊 多维对比：对比不同时期、类别、供应商的费用
3. ⚠️ 预算预警：检测接近或超出预算的情况
4. 🔍 异常检测：识别重复提交、异常高额消费等问题
5. ⏱️ 时效性分析：分析报销提交的及时性
6. 📋 政策查询：解答报销政策相关问题
7. 💡 优化建议：提供成本优化和流程改进建议

回复风格：
- 使用markdown格式，包括表格、列表、emoji
- 突出关键发现和数字
- 提供可执行的建议
- 简洁但有深度

当用户提到月份时：
- 如果是过去的月份（如当前2月，用户说"11月12月"），默认指去年
- 如果用户说"本月"，指当前月份
- 如果用户明确说"去年"或具体年份，使用用户指定的年份

分析数据时：
1. 先理解用户真正想知道什么
2. 调用合适的工具获取数据
3. 深入分析数据，识别模式和异常
4. 生成洞察和建议
5. 用清晰的格式呈现`;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { messages } = await request.json();

    // 添加系统提示
    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // 第一次调用：LLM决定是否需要调用工具
    let response = await chatWithAI(messagesWithSystem, ANALYSIS_TOOLS);

    // 如果LLM请求调用工具
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = [];

      // 执行所有工具调用
      for (const toolCall of response.toolCalls) {
        try {
          const result = await executeAnalysisTool(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            {
              userId: session.user.id,
              tenantId: session.user.tenantId || '',
            }
          );

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: String(error),
            }),
          });
        }
      }

      // 第二次调用：让LLM基于工具结果生成最终回复
      const finalMessages = [
        ...messagesWithSystem,
        {
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
        },
        ...toolResults,
      ];

      response = await chatWithAI(finalMessages);
    }

    return NextResponse.json({
      success: true,
      message: response.content,
      finishReason: response.finishReason,
    });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { error: '处理失败', details: String(error) },
      { status: 500 }
    );
  }
}
```

### Step 7: 更新前端Chat组件

```typescript
// src/app/(dashboard)/dashboard/chat/page.tsx
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
    // 调用新的AI API
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const result = await response.json();

    if (result.success) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } else {
      // 错误处理
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，处理您的请求时出现了问题。请稍后再试。',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  } catch (error) {
    console.error('Send message error:', error);
    // 错误处理
  } finally {
    setIsLoading(false);
  }
};
```

## 🎯 使用示例

### 示例1：智能月份识别

**用户输入：**
```
"帮我看看11月和12月的AI费用有什么问题"
```

**LLM处理：**
```json
// 1. 理解：用户在2月询问11月12月，应该是2025年
// 2. 调用工具
{
  "tool": "analyze_tech_expenses",
  "params": {
    "months": [11, 12],
    "year": 2025,
    "scope": "company",
    "categories": ["ai_token"]
  }
}

// 3. 获取数据后分析
// 4. 生成深度报告
```

**AI回复：**
```markdown
# 2025年11-12月AI费用分析

## 📊 整体情况

| 月份 | AI费用 | 环比 | 主要问题 |
|------|--------|------|---------|
| 11月 | $1,234 | - | OpenAI占比过高(72%) |
| 12月 | $1,567 | +27% | 新增大额消费 |

## ⚠️ 发现的问题

### 1. 费用增长异常 (🔴 严重)
12月相比11月增长27%（+$333），主要原因：
- 12月15日单笔OpenAI消费$420（异常高）
- 新增3个Cursor订阅 ($150)

**建议：** 核实12/15的$420消费是否为业务正常需求

### 2. 供应商过度集中 (🟡 警告)
OpenAI占比达到72%，存在供应商锁定风险

**建议：**
- 评估Anthropic Claude作为备选
- 部分工作负载迁移至成本更低的模型
- 预计可节省20-30%成本

### 3. 报销延迟问题
11月有3笔费用在12月才提交（延迟30+天）

## 💡 优化建议

1. **立即行动**
   - 核实$420异常消费
   - 设置单日消费上限告警（建议$150）

2. **短期优化** (1-2周)
   - 测试Claude替代OpenAI的可行性
   - 审查Cursor订阅使用率
   - 提醒员工及时提交报销

3. **长期规划** (1-3月)
   - 实施供应商分散策略：60% OpenAI + 30% Claude + 10% 开源
   - 建立使用监控仪表板
   - 按项目分配AI成本

## 📈 预测

基于当前趋势，预计1月AI费用将达到$1,800。
建议设定月度预算上限$1,500，避免超支。
```

### 示例2：复杂查询

**用户输入：**
```
"上个月的技术费用有没有超预算？
有哪些异常消费？
报销提交的及时吗？"
```

**LLM处理：**
```json
// 理解：用户一次问了3个问题
// 1. 预算检查
// 2. 异常检测
// 3. 时效性分析

// 并行调用3个工具
[
  {
    "tool": "analyze_tech_expenses",
    "params": { "months": [1], "year": 2026, "scope": "company" }
  },
  {
    "tool": "check_budget_alerts"
  },
  {
    "tool": "detect_anomalies"
  },
  {
    "tool": "analyze_timeliness"
  }
]
```

**AI回复：**
整合4个工具的结果，生成综合分析报告。

## 📊 成本对比

### OpenRouter vs 官方API

| 模型 | 官方价格 | OpenRouter | 节省 |
|------|---------|-----------|-----|
| Claude 3.5 Sonnet | $3/$15 | $3/$15 | 0% |
| GPT-4 Turbo | $10/$30 | $7/$21 | 30% |
| GPT-3.5 Turbo | $0.5/$1.5 | $0.3/$0.9 | 40% |

### 实际成本估算

假设每天50次对话，每次：
- 500 tokens input
- 1000 tokens output

**月度成本 (Claude 3.5 Sonnet):**
```
50 对话/天 × 30 天 = 1500 对话/月

Input: 1500 × 500 × $3 / 1,000,000 = $2.25
Output: 1500 × 1000 × $15 / 1,000,000 = $22.50

总计: $24.75/月
```

**极低成本，带来巨大价值！**

## 🚀 立即开始

### 1. 获取OpenRouter API Key
访问: https://openrouter.ai/
注册并获取API密钥

### 2. 添加环境变量
```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxx
```

### 3. 部署代码
运行上述代码，即可拥有智能分析助手！

## 💡 高级功能

### 流式响应
```typescript
// 实现打字机效果
const stream = await openrouter.chat.completions.create({
  model: 'anthropic/claude-3.5-sonnet',
  messages,
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    // 逐字显示
  }
}
```

### 模型切换
```typescript
// 根据任务复杂度选择模型
const model = isComplexQuery
  ? 'anthropic/claude-3.5-sonnet'  // 复杂分析
  : 'google/gemini-flash-1.5';      // 简单查询，更便宜
```

### 缓存优化
```typescript
// 缓存常用查询
const cache = new Map();
const cacheKey = JSON.stringify({ messages, tools });

if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

## 📝 总结

使用OpenRouter集成LLM是最佳选择：
✅ 成本低
✅ 灵活性高
✅ 集成简单
✅ 效果强大

立即开始，让你的AI助手真正智能起来！🚀
