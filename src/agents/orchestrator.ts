/**
 * AI 协调器 - 智能报销 Agent 的核心控制器
 * 负责理解用户意图，协调各个专门的 Agent 完成任务
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAgentPrompt } from '@/lib/prompts/sample-prompts';
import type {
  Reimbursement,
  Trip,
  ReimbursementItem,
  User,
  Policy,
  BudgetEstimationRequest,
  BudgetEstimationResponse,
} from '@/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface AgentContext {
  user: User;
  currentTrip?: Trip;
  currentReimbursement?: Reimbursement;
  policies: Policy[];
  conversationHistory: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AgentAction {
  type: AgentActionType;
  params: Record<string, any>;
  description: string;
}

export type AgentActionType =
  | 'collect_emails'
  | 'scan_calendar'
  | 'parse_receipt'
  | 'create_reimbursement'
  | 'add_expense_item'
  | 'check_compliance'
  | 'estimate_budget'
  | 'submit_reimbursement'
  | 'ask_clarification'
  | 'show_suggestions'
  | 'create_trip'
  | 'link_expenses_to_trip';

export interface AgentResponse {
  message: string;
  actions: AgentAction[];
  suggestions?: string[];
  data?: Record<string, any>;
}

// ============================================================================
// 工具定义
// ============================================================================

const ORCHESTRATOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'collect_travel_emails',
    description: '从用户邮箱中收集差旅相关的邮件，包括机票、酒店、火车票预订确认等',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_range: {
          type: 'object',
          properties: {
            start: { type: 'string', description: '开始日期 (YYYY-MM-DD)' },
            end: { type: 'string', description: '结束日期 (YYYY-MM-DD)' },
          },
          required: ['start', 'end'],
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '搜索关键词',
        },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'scan_calendar_events',
    description: '扫描用户日历，识别出差行程和相关会议',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_range: {
          type: 'object',
          properties: {
            start: { type: 'string', description: '开始日期' },
            end: { type: 'string', description: '结束日期' },
          },
          required: ['start', 'end'],
        },
        include_past: {
          type: 'boolean',
          description: '是否包含过去的事件',
        },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'parse_receipt',
    description: '解析票据/发票图片，提取金额、日期、商家等信息',
    input_schema: {
      type: 'object' as const,
      properties: {
        receipt_url: {
          type: 'string',
          description: '票据图片 URL',
        },
        receipt_type: {
          type: 'string',
          enum: ['invoice', 'receipt', 'itinerary', 'unknown'],
          description: '票据类型',
        },
      },
      required: ['receipt_url'],
    },
  },
  {
    name: 'create_trip',
    description: '创建新的出差行程记录',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: '行程标题' },
        destination: { type: 'string', description: '目的地' },
        start_date: { type: 'string', description: '开始日期' },
        end_date: { type: 'string', description: '结束日期' },
        purpose: { type: 'string', description: '出差目的' },
      },
      required: ['title', 'start_date', 'end_date'],
    },
  },
  {
    name: 'estimate_trip_budget',
    description: '预估出差行程的预算',
    input_schema: {
      type: 'object' as const,
      properties: {
        destination: { type: 'string', description: '目的地' },
        start_date: { type: 'string', description: '开始日期' },
        end_date: { type: 'string', description: '结束日期' },
        trip_type: { type: 'string', description: '行程类型（客户拜访、培训、会议等）' },
        travelers: { type: 'number', description: '出行人数' },
      },
      required: ['destination', 'start_date', 'end_date'],
    },
  },
  {
    name: 'create_reimbursement',
    description: '创建新的报销申请',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: '报销标题' },
        trip_id: { type: 'string', description: '关联的行程 ID（可选）' },
        description: { type: 'string', description: '报销说明' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_expense_item',
    description: '向报销单添加费用明细',
    input_schema: {
      type: 'object' as const,
      properties: {
        reimbursement_id: { type: 'string', description: '报销单 ID' },
        category: { type: 'string', description: '费用类别' },
        amount: { type: 'number', description: '金额' },
        currency: { type: 'string', description: '货币' },
        date: { type: 'string', description: '消费日期' },
        description: { type: 'string', description: '费用说明' },
        location: { type: 'string', description: '消费地点（可选）' },
        vendor: { type: 'string', description: '商家名称（可选）' },
        receipt_id: { type: 'string', description: '票据 ID（可选）' },
      },
      required: ['reimbursement_id', 'category', 'amount', 'currency', 'date', 'description'],
    },
  },
  {
    name: 'check_compliance',
    description: '检查报销项目是否符合公司政策',
    input_schema: {
      type: 'object' as const,
      properties: {
        reimbursement_id: { type: 'string', description: '报销单 ID' },
        item_id: { type: 'string', description: '费用明细 ID（可选，不填则检查整个报销单）' },
      },
      required: ['reimbursement_id'],
    },
  },
  {
    name: 'submit_reimbursement',
    description: '提交报销申请进入审批流程',
    input_schema: {
      type: 'object' as const,
      properties: {
        reimbursement_id: { type: 'string', description: '报销单 ID' },
      },
      required: ['reimbursement_id'],
    },
  },
  {
    name: 'get_missing_items',
    description: '检查行程或报销单缺少的材料',
    input_schema: {
      type: 'object' as const,
      properties: {
        trip_id: { type: 'string', description: '行程 ID' },
        reimbursement_id: { type: 'string', description: '报销单 ID' },
      },
      required: [],
    },
  },
];

// ============================================================================
// 协调器实现
// ============================================================================

export class ReimbursementOrchestrator {
  private client: Anthropic;
  private context: AgentContext;
  private toolHandlers: Map<string, (params: any) => Promise<any>>;

  constructor(context: AgentContext) {
    this.client = new Anthropic();
    this.context = context;
    this.toolHandlers = new Map();
    this.registerToolHandlers();
  }

  /**
   * 注册工具处理器
   */
  private registerToolHandlers() {
    // 这些处理器会调用相应的 Agent 或服务
    this.toolHandlers.set('collect_travel_emails', async (params) => {
      // TODO: 调用 EmailAgent
      return { collected: [], message: '邮件收集功能即将实现' };
    });

    this.toolHandlers.set('scan_calendar_events', async (params) => {
      // TODO: 调用 CalendarAgent
      return { events: [], message: '日历扫描功能即将实现' };
    });

    this.toolHandlers.set('parse_receipt', async (params) => {
      // TODO: 调用 ReceiptAgent
      return { parsed: null, message: '票据解析功能即将实现' };
    });

    this.toolHandlers.set('create_trip', async (params) => {
      // TODO: 调用 TripService
      return { tripId: 'trip_xxx', message: '行程已创建' };
    });

    this.toolHandlers.set('estimate_trip_budget', async (params) => {
      // TODO: 调用 BudgetEstimator
      return { estimate: null, message: '预算预估功能即将实现' };
    });

    this.toolHandlers.set('create_reimbursement', async (params) => {
      // TODO: 调用 ReimbursementService
      return { reimbursementId: 'reimb_xxx', message: '报销单已创建' };
    });

    this.toolHandlers.set('add_expense_item', async (params) => {
      // TODO: 调用 ReimbursementService
      return { itemId: 'item_xxx', message: '费用已添加' };
    });

    this.toolHandlers.set('check_compliance', async (params) => {
      // TODO: 调用 PolicyEngine
      return { passed: true, issues: [], message: '合规检查通过' };
    });

    this.toolHandlers.set('submit_reimbursement', async (params) => {
      // TODO: 调用 ReimbursementService
      return { submitted: true, message: '报销单已提交' };
    });

    this.toolHandlers.set('get_missing_items', async (params) => {
      // TODO: 调用 TripAgent
      return { missing: [], message: '材料检查完成' };
    });
  }

  /**
   * 处理用户消息
   */
  async chat(userMessage: string): Promise<AgentResponse> {
    // 添加到对话历史
    this.context.conversationHistory.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    });

    // 构建系统提示
    const systemPrompt = this.buildSystemPrompt();

    // 构建消息历史
    const messages: Anthropic.MessageParam[] = this.context.conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    try {
      // 调用 Claude API
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: ORCHESTRATOR_TOOLS,
        messages,
      });

      // 处理响应
      return await this.processResponse(response);
    } catch (error) {
      console.error('Orchestrator error:', error);
      throw error;
    }
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(): string {
    const basePrompt = getAgentPrompt('orchestrator');

    const contextInfo = `
当前用户信息：
- 姓名: ${this.context.user.name}
- 部门: ${this.context.user.department || '未设置'}
- 角色: ${this.context.user.role}

${this.context.currentTrip ? `当前行程: ${this.context.currentTrip.title} (${this.context.currentTrip.status})` : ''}
${this.context.currentReimbursement ? `当前报销单: ${this.context.currentReimbursement.title} (${this.context.currentReimbursement.status})` : ''}

活跃的报销政策: ${this.context.policies.filter((p) => p.isActive).length} 条
`;

    return `${basePrompt}\n\n${contextInfo}`;
  }

  /**
   * 处理 API 响应
   */
  private async processResponse(response: Anthropic.Message): Promise<AgentResponse> {
    const actions: AgentAction[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        // 执行工具调用
        const handler = this.toolHandlers.get(block.name);
        if (handler) {
          const result = await handler(block.input);
          actions.push({
            type: block.name as AgentActionType,
            params: block.input as Record<string, any>,
            description: result.message || `执行 ${block.name}`,
          });
        }
      }
    }

    // 添加到对话历史
    this.context.conversationHistory.push({
      role: 'assistant',
      content: textContent,
      timestamp: new Date(),
      metadata: { actions },
    });

    return {
      message: textContent,
      actions,
      suggestions: this.generateSuggestions(),
    };
  }

  /**
   * 生成后续建议
   */
  private generateSuggestions(): string[] {
    const suggestions: string[] = [];

    // 根据当前状态生成建议
    if (!this.context.currentReimbursement) {
      suggestions.push('创建新的报销申请');
    } else if (this.context.currentReimbursement.status === 'draft') {
      suggestions.push('检查报销材料是否齐全');
      suggestions.push('提交报销申请');
    }

    if (!this.context.currentTrip) {
      suggestions.push('创建出差行程记录');
    }

    suggestions.push('从邮箱收集差旅确认邮件');
    suggestions.push('检查日历中的出差安排');

    return suggestions.slice(0, 3);
  }

  /**
   * 获取对话历史
   */
  getConversationHistory(): ConversationMessage[] {
    return this.context.conversationHistory;
  }

  /**
   * 清空对话历史
   */
  clearHistory() {
    this.context.conversationHistory = [];
  }

  /**
   * 更新上下文
   */
  updateContext(updates: Partial<AgentContext>) {
    this.context = { ...this.context, ...updates };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createOrchestrator(
  user: User,
  policies: Policy[],
  options?: {
    currentTrip?: Trip;
    currentReimbursement?: Reimbursement;
  }
): ReimbursementOrchestrator {
  const context: AgentContext = {
    user,
    policies,
    currentTrip: options?.currentTrip,
    currentReimbursement: options?.currentReimbursement,
    conversationHistory: [],
  };

  return new ReimbursementOrchestrator(context);
}
