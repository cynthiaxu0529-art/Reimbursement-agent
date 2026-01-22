/**
 * 默认报销政策模板
 * 企业可以基于这些模板自定义
 */

import type { Policy, PolicyRule } from '@/types';
import { ExpenseCategory, Currency } from '@/types';
import { v4 as uuid } from 'uuid';

/**
 * 创建默认差旅政策
 */
export function createDefaultTravelPolicy(tenantId: string): Policy {
  const policyId = uuid();

  const rules: PolicyRule[] = [
    // 机票规则
    {
      id: uuid(),
      policyId,
      name: '国内机票限额',
      category: ExpenseCategory.FLIGHT,
      limit: {
        type: 'per_item',
        amount: 2000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: '国内机票单次费用不得超过 2000 元（经济舱）',
      suggestion: '如需商务舱请提前申请特殊审批',
      isComplete: true,
    },
    {
      id: uuid(),
      policyId,
      name: '国际机票限额',
      category: ExpenseCategory.FLIGHT,
      condition: {
        type: 'location',
        operator: 'not_in',
        value: ['中国', 'China', '国内'],
      },
      limit: {
        type: 'per_item',
        amount: 8000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: true,
      message: '国际机票需要提前审批',
      isComplete: true,
    },

    // 酒店规则
    {
      id: uuid(),
      policyId,
      name: '酒店住宿限额-普通城市',
      category: ExpenseCategory.HOTEL,
      limit: {
        type: 'per_day',
        amount: 500,
        currency: Currency.CNY,
        conditions: {
          city: ['其他城市'],
        },
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: '普通城市酒店每晚不得超过 500 元',
      isComplete: true,
    },
    {
      id: uuid(),
      policyId,
      name: '酒店住宿限额-一线城市',
      category: ExpenseCategory.HOTEL,
      limit: {
        type: 'per_day',
        amount: 800,
        currency: Currency.CNY,
        conditions: {
          city: ['北京', '上海', '广州', '深圳'],
        },
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: '一线城市酒店每晚不得超过 800 元',
      isComplete: true,
    },

    // 餐饮规则
    {
      id: uuid(),
      policyId,
      name: '餐饮限额',
      category: ExpenseCategory.MEAL,
      limit: {
        type: 'per_day',
        amount: 150,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: '出差期间餐饮每人每天不得超过 150 元',
      suggestion: '如有客户招待需求请使用客户招待类别',
      isComplete: true,
    },

    // 市内交通规则
    {
      id: uuid(),
      policyId,
      name: '市内交通限额',
      category: ExpenseCategory.TAXI,
      limit: {
        type: 'per_item',
        amount: 100,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: '单次市内交通费用不得超过 100 元',
      suggestion: '如遇特殊情况（如深夜加班、携带重物）可申请例外',
      isComplete: true,
    },
    {
      id: uuid(),
      policyId,
      name: '市内交通每日限额',
      category: ExpenseCategory.TAXI,
      limit: {
        type: 'per_day',
        amount: 200,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: '每日市内交通费用合计不得超过 200 元',
      isComplete: true,
    },
  ];

  return {
    id: policyId,
    tenantId,
    name: '差旅费报销政策',
    description: '适用于员工出差期间产生的各项费用',
    isActive: true,
    priority: 1,
    rules,
    createdVia: 'ui',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建默认技术费用政策
 */
export function createDefaultTechPolicy(tenantId: string): Policy {
  const policyId = uuid();

  const rules: PolicyRule[] = [
    // AI Token 规则
    {
      id: uuid(),
      policyId,
      name: 'AI 服务月度限额',
      category: ExpenseCategory.AI_TOKEN,
      limit: {
        type: 'per_month',
        amount: 5000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: false,
      message: 'AI 服务（如 OpenAI、Anthropic）月度费用不得超过 5000 元',
      suggestion: '如需更高额度请向技术主管申请预算增加',
      isComplete: true,
    },

    // 云资源规则
    {
      id: uuid(),
      policyId,
      name: '云资源月度限额',
      category: ExpenseCategory.CLOUD_RESOURCE,
      limit: {
        type: 'per_month',
        amount: 10000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: true,
      message: '云资源费用（AWS、GCP、Azure 等）需要审批',
      suggestion: '请确保云资源使用与项目相关，并做好成本优化',
      isComplete: true,
    },

    // 软件订阅规则
    {
      id: uuid(),
      policyId,
      name: '软件订阅审批',
      category: ExpenseCategory.SOFTWARE,
      limit: {
        type: 'per_item',
        amount: 1000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: true,
      message: '软件订阅超过 1000 元需要审批',
      suggestion: '请优先使用公司已有的软件资源',
      isComplete: true,
    },
  ];

  return {
    id: policyId,
    tenantId,
    name: '技术费用报销政策',
    description: '适用于 AI 服务、云资源、软件订阅等技术相关费用',
    isActive: true,
    priority: 2,
    rules,
    createdVia: 'ui',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建默认业务费用政策
 */
export function createDefaultBusinessPolicy(tenantId: string): Policy {
  const policyId = uuid();

  const rules: PolicyRule[] = [
    // 客户招待规则
    {
      id: uuid(),
      policyId,
      name: '客户招待限额',
      category: ExpenseCategory.CLIENT_ENTERTAINMENT,
      limit: {
        type: 'per_item',
        amount: 500,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: true,
      message: '客户招待费用每次不得超过 500 元/人',
      suggestion: '请在报销时注明客户信息和招待目的',
      isComplete: true,
    },

    // 培训费用规则
    {
      id: uuid(),
      policyId,
      name: '培训费用审批',
      category: ExpenseCategory.TRAINING,
      limit: {
        type: 'per_item',
        amount: 3000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: true,
      message: '培训费用超过 3000 元需要主管审批',
      suggestion: '请提前申请培训预算',
      isComplete: true,
    },

    // 会议费用规则
    {
      id: uuid(),
      policyId,
      name: '会议费用审批',
      category: ExpenseCategory.CONFERENCE,
      limit: {
        type: 'per_item',
        amount: 2000,
        currency: Currency.CNY,
      },
      requiresReceipt: true,
      requiresApproval: true,
      message: '会议相关费用需要审批',
      isComplete: true,
    },
  ];

  return {
    id: policyId,
    tenantId,
    name: '业务费用报销政策',
    description: '适用于客户招待、培训、会议等业务相关费用',
    isActive: true,
    priority: 3,
    rules,
    createdVia: 'ui',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 获取所有默认政策
 */
export function getAllDefaultPolicies(tenantId: string): Policy[] {
  return [
    createDefaultTravelPolicy(tenantId),
    createDefaultTechPolicy(tenantId),
    createDefaultBusinessPolicy(tenantId),
  ];
}

/**
 * 政策模板供 chat 创建时参考
 */
export const POLICY_TEMPLATES = {
  travel: {
    name: '差旅政策',
    description: '包含机票、酒店、餐饮、交通等差旅相关规则',
    samplePrompt: '帮我创建一个差旅报销政策：机票经济舱最高2000元，一线城市酒店每晚不超过800元，其他城市500元，餐饮每天150元',
  },
  tech: {
    name: '技术费用政策',
    description: '包含 AI 服务、云资源、软件订阅等技术费用规则',
    samplePrompt: '帮我创建技术费用政策：AI API 月度上限5000元，云资源费用需要审批，单个软件订阅超过1000元需要审批',
  },
  business: {
    name: '业务费用政策',
    description: '包含客户招待、培训、会议等业务费用规则',
    samplePrompt: '创建业务费用政策：客户招待每人每次不超过500元需要说明客户信息，培训费用超过3000元需要审批',
  },
};
