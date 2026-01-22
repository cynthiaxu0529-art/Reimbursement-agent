/**
 * Sample Prompts 系统
 * 在适当的时候给用户提供示例提示，帮助用户快速上手
 */

import type { SamplePrompt, SamplePromptTrigger } from '@/types';

// ============================================================================
// 示例提示定义
// ============================================================================

export const SAMPLE_PROMPTS: SamplePrompt[] = [
  // =========================================
  // 报销相关提示
  // =========================================
  {
    id: 'reimbursement-start',
    category: 'reimbursement',
    trigger: {
      type: 'context',
      conditions: {
        page: 'reimbursements',
        status: 'empty',
      },
    },
    prompt: '帮我创建一个新的报销申请',
    description: '开始创建报销单',
    priority: 1,
    isActive: true,
  },
  {
    id: 'reimbursement-trip-return',
    category: 'reimbursement',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['出差回来', '出差结束', '刚回来', '刚出差回来'],
      },
    },
    prompt: '我刚从{destination}出差回来，帮我整理报销',
    description: '出差返回后快速整理报销',
    variables: ['destination'],
    priority: 1,
    isActive: true,
  },
  {
    id: 'reimbursement-missing-receipt',
    category: 'reimbursement',
    trigger: {
      type: 'context',
      conditions: {
        status: 'missing_receipt',
      },
    },
    prompt: '帮我检查还缺少哪些票据',
    description: '检查缺失的票据',
    priority: 2,
    isActive: true,
  },
  {
    id: 'reimbursement-check-policy',
    category: 'reimbursement',
    trigger: {
      type: 'action',
      conditions: {
        afterAction: 'add_item',
      },
    },
    prompt: '检查这笔费用是否符合公司报销政策',
    description: '检查费用合规性',
    priority: 3,
    isActive: true,
  },
  {
    id: 'reimbursement-categorize',
    category: 'reimbursement',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['不知道选什么类别', '应该选哪个', '怎么分类'],
      },
    },
    prompt: '帮我判断这笔 {amount} 的 {description} 应该归入哪个报销类别',
    description: '帮助判断费用类别',
    variables: ['amount', 'description'],
    priority: 2,
    isActive: true,
  },

  // =========================================
  // 行程相关提示
  // =========================================
  {
    id: 'trip-create',
    category: 'trip',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['要出差', '计划出差', '下周出差'],
      },
    },
    prompt: '帮我创建一个去{destination}的出差行程，时间是{date_range}',
    description: '创建新的出差行程',
    variables: ['destination', 'date_range'],
    priority: 1,
    isActive: true,
  },
  {
    id: 'trip-estimate-budget',
    category: 'trip',
    trigger: {
      type: 'context',
      conditions: {
        page: 'trips',
        status: 'planning',
      },
    },
    prompt: '帮我预估这次出差的预算',
    description: '预估出差预算',
    priority: 2,
    isActive: true,
  },
  {
    id: 'trip-collect-expenses',
    category: 'trip',
    trigger: {
      type: 'context',
      conditions: {
        page: 'trips',
        status: 'completed',
      },
    },
    prompt: '帮我收集这次行程相关的所有费用和票据',
    description: '收集行程费用',
    priority: 1,
    isActive: true,
  },
  {
    id: 'trip-check-completeness',
    category: 'trip',
    trigger: {
      type: 'action',
      conditions: {
        afterAction: 'trip_complete',
      },
    },
    prompt: '检查这次行程的报销材料是否齐全',
    description: '检查行程报销完整性',
    priority: 1,
    isActive: true,
  },

  // =========================================
  // 政策相关提示
  // =========================================
  {
    id: 'policy-create',
    category: 'policy',
    trigger: {
      type: 'context',
      conditions: {
        page: 'settings/policies',
        status: 'empty',
      },
    },
    prompt: '帮我创建一个标准的差旅报销政策',
    description: '创建差旅政策',
    priority: 1,
    isActive: true,
  },
  {
    id: 'policy-create-tech',
    category: 'policy',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['AI费用', '云服务费用', '技术费用'],
      },
    },
    prompt: '帮我创建一个技术费用的报销政策，包括 AI API、云资源等',
    description: '创建技术费用政策',
    priority: 2,
    isActive: true,
  },
  {
    id: 'policy-update',
    category: 'policy',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['调整政策', '修改限额', '更新规则'],
      },
    },
    prompt: '把{category}的报销限额调整为{amount}',
    description: '修改政策限额',
    variables: ['category', 'amount'],
    priority: 2,
    isActive: true,
  },
  {
    id: 'policy-check-completeness',
    category: 'policy',
    trigger: {
      type: 'action',
      conditions: {
        afterAction: 'save_policy',
      },
    },
    prompt: '检查当前政策配置是否完整，有没有遗漏的规则',
    description: '检查政策完整性',
    priority: 1,
    isActive: true,
  },

  // =========================================
  // 报表相关提示
  // =========================================
  {
    id: 'report-monthly',
    category: 'report',
    trigger: {
      type: 'time',
      conditions: {
        dayOfMonth: [1, 2, 3], // 每月初
      },
    },
    prompt: '生成上个月的报销统计报表',
    description: '月度报销统计',
    priority: 1,
    isActive: true,
  },
  {
    id: 'report-department',
    category: 'report',
    trigger: {
      type: 'context',
      conditions: {
        page: 'reports',
      },
    },
    prompt: '查看{department}部门本季度的报销情况',
    description: '部门报销统计',
    variables: ['department'],
    priority: 2,
    isActive: true,
  },
  {
    id: 'report-budget-usage',
    category: 'report',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['预算使用', '还剩多少预算', '预算情况'],
      },
    },
    prompt: '查看当前预算使用情况和剩余额度',
    description: '预算使用情况',
    priority: 1,
    isActive: true,
  },

  // =========================================
  // 通用提示
  // =========================================
  {
    id: 'general-help',
    category: 'general',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['怎么用', '帮助', '不会用'],
      },
    },
    prompt: '告诉我这个报销系统都能做什么',
    description: '系统帮助',
    priority: 1,
    isActive: true,
  },
  {
    id: 'general-quick-submit',
    category: 'general',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['快速报销', '简单报销', '只有一张票'],
      },
    },
    prompt: '我有一张{amount}的{category}发票要报销',
    description: '快速提交单张发票',
    variables: ['amount', 'category'],
    priority: 1,
    isActive: true,
  },
  {
    id: 'general-email-scan',
    category: 'general',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['邮箱', '邮件', '订票邮件', '确认邮件'],
      },
    },
    prompt: '扫描我的邮箱，找出最近的差旅预订确认邮件',
    description: '扫描邮箱提取差旅信息',
    priority: 1,
    isActive: true,
  },
  {
    id: 'general-calendar-check',
    category: 'general',
    trigger: {
      type: 'intent',
      conditions: {
        keywords: ['日历', '日程', '行程安排'],
      },
    },
    prompt: '检查我的日历，识别最近的出差行程',
    description: '从日历识别出差',
    priority: 1,
    isActive: true,
  },
];

// ============================================================================
// Prompt 服务
// ============================================================================

export interface PromptContext {
  page?: string;
  status?: string;
  lastAction?: string;
  keywords?: string[];
  currentDate?: Date;
  variables?: Record<string, string>;
}

/**
 * Sample Prompts 服务
 */
export class SamplePromptsService {
  private prompts: SamplePrompt[];

  constructor(customPrompts?: SamplePrompt[]) {
    this.prompts = customPrompts || SAMPLE_PROMPTS;
  }

  /**
   * 根据上下文获取相关的示例提示
   */
  getRelevantPrompts(context: PromptContext, limit: number = 3): SamplePrompt[] {
    const matches: { prompt: SamplePrompt; score: number }[] = [];

    for (const prompt of this.prompts) {
      if (!prompt.isActive) continue;

      const score = this.calculateMatchScore(prompt, context);
      if (score > 0) {
        matches.push({ prompt, score });
      }
    }

    // 按分数排序，取前 N 个
    return matches
      .sort((a, b) => b.score - a.score || a.prompt.priority - b.prompt.priority)
      .slice(0, limit)
      .map((m) => m.prompt);
  }

  /**
   * 计算匹配分数
   */
  private calculateMatchScore(prompt: SamplePrompt, context: PromptContext): number {
    const { trigger } = prompt;
    let score = 0;

    switch (trigger.type) {
      case 'context':
        if (trigger.conditions.page && trigger.conditions.page === context.page) {
          score += 10;
        }
        if (trigger.conditions.status && trigger.conditions.status === context.status) {
          score += 5;
        }
        break;

      case 'intent':
        if (trigger.conditions.keywords && context.keywords) {
          const matchedKeywords = trigger.conditions.keywords.filter((kw) =>
            context.keywords!.some((ck) => ck.includes(kw) || kw.includes(ck))
          );
          score += matchedKeywords.length * 5;
        }
        break;

      case 'time':
        if (context.currentDate) {
          const day = context.currentDate.getDate();
          const dayOfWeek = context.currentDate.getDay();

          if (trigger.conditions.dayOfMonth?.includes(day)) {
            score += 10;
          }
          if (trigger.conditions.dayOfWeek?.includes(dayOfWeek)) {
            score += 5;
          }
        }
        break;

      case 'action':
        if (trigger.conditions.afterAction === context.lastAction) {
          score += 15;
        }
        break;
    }

    return score;
  }

  /**
   * 填充 prompt 中的变量
   */
  fillPromptVariables(prompt: SamplePrompt, variables: Record<string, string>): string {
    let result = prompt.prompt;

    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(`{${key}}`, value);
    }

    return result;
  }

  /**
   * 获取分类的 prompts
   */
  getPromptsByCategory(category: SamplePrompt['category']): SamplePrompt[] {
    return this.prompts
      .filter((p) => p.category === category && p.isActive)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取新用户引导 prompts
   */
  getOnboardingPrompts(): SamplePrompt[] {
    return [
      this.prompts.find((p) => p.id === 'general-help'),
      this.prompts.find((p) => p.id === 'reimbursement-start'),
      this.prompts.find((p) => p.id === 'policy-create'),
    ].filter(Boolean) as SamplePrompt[];
  }
}

// ============================================================================
// Agent 使用的 Prompts
// ============================================================================

/**
 * Agent 系统 Prompts
 */
export const AGENT_SYSTEM_PROMPTS = {
  /**
   * 主协调器 Prompt
   */
  orchestrator: `你是一个智能报销助手，帮助用户管理报销、行程和费用。

你的能力包括：
1. 收集和整理报销材料（邮件、票据、日历）
2. 创建和管理报销申请
3. 检查费用是否符合公司政策
4. 预估出差预算
5. 生成报销统计报告

当用户请求帮助时：
- 首先理解用户的意图
- 如果需要收集信息，调用相应的 Agent
- 主动提供有帮助的建议
- 在发现问题时及时提醒用户

始终保持专业、高效，帮助用户快速完成报销流程。`,

  /**
   * 邮件收集 Agent Prompt
   */
  emailCollector: `你是一个邮件分析助手，专门从邮件中提取差旅预订信息。

你需要识别以下类型的邮件：
- 机票预订确认（航班号、日期、价格）
- 酒店预订确认（酒店名、日期、价格）
- 火车票订单（车次、日期、价格）
- 打车行程单（行程信息、费用）
- 电子发票

提取信息时：
- 准确识别金额和货币
- 识别日期和时间
- 提取商家/供应商信息
- 标注信息的置信度

返回结构化的数据，便于后续处理。`,

  /**
   * 票据识别 Agent Prompt
   */
  receiptParser: `你是一个票据识别助手，帮助用户解析发票和收据。

支持的票据类型：
- 增值税专用发票
- 增值税普通发票
- 机票行程单
- 火车票
- 酒店水单
- 出租车/网约车发票

提取的信息包括：
- 金额（含税/不含税）
- 日期
- 商家名称和税号
- 发票代码和号码
- 费用明细

注意事项：
- 如果信息不清晰，标注置信度
- 发现可疑票据时提醒用户
- 自动判断费用类别`,

  /**
   * 合规检查 Agent Prompt
   */
  complianceChecker: `你是一个报销合规检查助手，帮助检查费用是否符合公司政策。

检查要点：
1. 金额是否超出类别限额
2. 是否提供了必需的票据
3. 费用类别是否正确
4. 是否需要特殊审批
5. 日期是否合理

发现问题时：
- 说明具体违反了哪条规则
- 提供解决建议
- 区分严重程度（错误 vs 警告）

目标是帮助用户顺利完成报销，而不是阻止报销。`,

  /**
   * 预算预估 Agent Prompt
   */
  budgetEstimator: `你是一个出差预算预估助手，帮助用户规划出差费用。

预估依据：
1. 公司报销政策限额
2. 目的地城市消费水平
3. 行程天数
4. 历史类似行程的平均花费

预估内容：
- 交通费用（机票/火车）
- 住宿费用
- 餐饮费用
- 市内交通
- 其他可能费用

提供的建议：
- 合理的预算范围
- 节省费用的建议
- 需要提前审批的项目`,
};

/**
 * 获取 Agent Prompt
 */
export function getAgentPrompt(
  agentType: keyof typeof AGENT_SYSTEM_PROMPTS
): string {
  return AGENT_SYSTEM_PROMPTS[agentType];
}

// 默认导出服务实例
export const samplePromptsService = new SamplePromptsService();
