/**
 * Skill 插件管理器
 * 管理用户自定义的报销相关 Skill
 */

import type {
  Skill,
  SkillExecutor,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillTriggerType,
  SkillCategoryType,
  SkillCondition,
  User,
  Tenant,
} from '@/types';
import { SkillTrigger, SkillCategory } from '@/types';

// ============================================================================
// Skill 执行器
// ============================================================================

/**
 * JavaScript 执行器
 * 在沙箱环境中执行用户代码
 */
async function executeJavaScript(
  code: string,
  context: SkillExecutionContext
): Promise<any> {
  // 创建安全的执行环境
  const sandbox = {
    context,
    console: {
      log: (...args: any[]) => console.log('[Skill]', ...args),
      error: (...args: any[]) => console.error('[Skill]', ...args),
    },
    fetch: globalThis.fetch,
    JSON,
    Date,
    Math,
    // 禁止危险操作
    eval: undefined,
    Function: undefined,
    require: undefined,
    process: undefined,
  };

  try {
    // 使用 Function 构造器创建沙箱函数
    const fn = new Function(
      'sandbox',
      `with (sandbox) { return (async () => { ${code} })(); }`
    );
    return await fn(sandbox);
  } catch (error) {
    throw new Error(`JavaScript execution error: ${error}`);
  }
}

/**
 * Webhook 执行器
 */
async function executeWebhook(
  executor: SkillExecutor,
  context: SkillExecutionContext
): Promise<any> {
  if (!executor.webhookUrl) {
    throw new Error('Webhook URL is required');
  }

  const response = await fetch(executor.webhookUrl, {
    method: executor.webhookMethod || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...executor.webhookHeaders,
    },
    body: JSON.stringify({
      trigger: context.trigger,
      data: {
        reimbursement: context.reimbursement,
        trip: context.trip,
        receipt: context.receipt,
        expenseItem: context.expenseItem,
        params: context.params,
      },
      user: {
        id: context.user.id,
        name: context.user.name,
        email: context.user.email,
      },
      tenant: {
        id: context.tenant.id,
        name: context.tenant.name,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * AI Prompt 执行器
 */
async function executeAIPrompt(
  executor: SkillExecutor,
  context: SkillExecutionContext
): Promise<any> {
  if (!executor.prompt) {
    throw new Error('AI prompt is required');
  }

  // 替换 prompt 中的变量
  let prompt = executor.prompt;
  prompt = prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = (context as any)[key] || context.params?.[key];
    return value ? JSON.stringify(value) : '';
  });

  // 调用 AI API
  const response = await fetch('/api/ai/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: executor.model || 'claude-sonnet-4-20250514',
    }),
  });

  if (!response.ok) {
    throw new Error(`AI execution failed: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Skill 管理器
// ============================================================================

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private triggerIndex: Map<SkillTriggerType, Skill[]> = new Map();

  constructor(skills: Skill[] = []) {
    for (const skill of skills) {
      this.registerSkill(skill);
    }
  }

  /**
   * 注册 Skill
   */
  registerSkill(skill: Skill): void {
    if (!skill.isActive) return;

    this.skills.set(skill.id, skill);

    // 建立触发器索引
    for (const trigger of skill.triggers) {
      if (!this.triggerIndex.has(trigger.type)) {
        this.triggerIndex.set(trigger.type, []);
      }
      this.triggerIndex.get(trigger.type)!.push(skill);
    }

    // 按优先级排序
    for (const [, skills] of this.triggerIndex) {
      skills.sort((a: Skill, b: Skill) => {
        const aPriority = a.triggers[0]?.priority || 0;
        const bPriority = b.triggers[0]?.priority || 0;
        return bPriority - aPriority;
      });
    }
  }

  /**
   * 注销 Skill
   */
  unregisterSkill(skillId: string): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    this.skills.delete(skillId);

    // 从触发器索引中移除
    for (const [_triggerType, skills] of this.triggerIndex) {
      const index = skills.findIndex((s: Skill) => s.id === skillId);
      if (index !== -1) {
        skills.splice(index, 1);
      }
    }
  }

  /**
   * 获取指定触发器的 Skills
   */
  getSkillsForTrigger(trigger: SkillTriggerType): Skill[] {
    return this.triggerIndex.get(trigger) || [];
  }

  /**
   * 执行触发器对应的所有 Skills
   */
  async executeTrigger(
    trigger: SkillTriggerType,
    context: SkillExecutionContext
  ): Promise<Map<string, SkillExecutionResult>> {
    const results = new Map<string, SkillExecutionResult>();
    const skills = this.getSkillsForTrigger(trigger);

    for (const skill of skills) {
      // 检查条件
      const triggerConfig = skill.triggers.find((t) => t.type === trigger);
      if (triggerConfig?.conditions && !this.checkConditions(triggerConfig.conditions, context)) {
        continue;
      }

      const startTime = Date.now();

      try {
        const result = await this.executeSkill(skill, context);
        results.set(skill.id, {
          success: true,
          data: result,
          executionTime: Date.now() - startTime,
        });
      } catch (error) {
        results.set(skill.id, {
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          executionTime: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * 执行单个 Skill
   */
  async executeSkill(skill: Skill, context: SkillExecutionContext): Promise<any> {
    const { executor } = skill;

    switch (executor.type) {
      case 'javascript':
        if (!executor.code) throw new Error('JavaScript code is required');
        return executeJavaScript(executor.code, context);

      case 'webhook':
        return executeWebhook(executor, context);

      case 'ai_prompt':
        return executeAIPrompt(executor, context);

      case 'mcp':
        // MCP 执行器需要 MCP 客户端支持
        throw new Error('MCP executor not implemented yet');

      default:
        throw new Error(`Unknown executor type: ${executor.type}`);
    }
  }

  /**
   * 检查条件
   */
  private checkConditions(
    conditions: SkillCondition[],
    context: SkillExecutionContext
  ): boolean {
    for (const condition of conditions) {
      const value = this.getNestedValue(context, condition.field);

      switch (condition.operator) {
        case 'eq':
          if (value !== condition.value) return false;
          break;
        case 'ne':
          if (value === condition.value) return false;
          break;
        case 'gt':
          if (value <= condition.value) return false;
          break;
        case 'lt':
          if (value >= condition.value) return false;
          break;
        case 'in':
          if (!Array.isArray(condition.value) || !condition.value.includes(value)) return false;
          break;
        case 'not_in':
          if (Array.isArray(condition.value) && condition.value.includes(value)) return false;
          break;
        case 'contains':
          if (typeof value !== 'string' || !value.includes(condition.value)) return false;
          break;
        case 'regex':
          if (typeof value !== 'string' || !new RegExp(condition.value).test(value)) return false;
          break;
      }
    }

    return true;
  }

  /**
   * 获取嵌套属性值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 获取所有已注册的 Skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取指定类别的 Skills
   */
  getSkillsByCategory(category: SkillCategoryType): Skill[] {
    return this.getAllSkills().filter((s) => s.category === category);
  }
}

// ============================================================================
// 内置 Skills
// ============================================================================

/**
 * 创建里程补贴计算 Skill
 */
export function createMileageCalculatorSkill(tenantId: string): Skill {
  return {
    id: 'builtin_mileage_calculator',
    tenantId,
    name: '里程补贴计算',
    description: '根据行驶里程自动计算补贴金额',
    category: SkillCategory.CALCULATION,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    triggers: [
      {
        type: SkillTrigger.ON_EXPENSE_ADD,
        conditions: [
          { field: 'expenseItem.category', operator: 'eq', value: 'fuel' },
        ],
      },
    ],
    executor: {
      type: 'javascript',
      code: `
        const mileage = context.params?.mileage || 0;
        const ratePerKm = context.tenant.settings?.mileageRate || 0.8;
        const subsidy = mileage * ratePerKm;
        return { mileage, ratePerKm, subsidy, currency: 'CNY' };
      `,
    },
    inputSchema: {
      type: 'object',
      properties: {
        mileage: { type: 'number', description: '行驶里程（公里）', required: true },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        mileage: { type: 'number', description: '行驶里程' },
        ratePerKm: { type: 'number', description: '每公里补贴标准' },
        subsidy: { type: 'number', description: '补贴金额' },
        currency: { type: 'string', description: '货币' },
      },
    },
    permissions: [
      { resource: 'reimbursement', actions: ['read', 'write'] },
    ],
    configSchema: {
      fields: [
        {
          key: 'mileageRate',
          type: 'number',
          label: '每公里补贴标准',
          description: '单位：元/公里',
          default: 0.8,
        },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建重复检测 Skill
 */
export function createDuplicateDetectorSkill(tenantId: string): Skill {
  return {
    id: 'builtin_duplicate_detector',
    tenantId,
    name: '重复报销检测',
    description: '检测是否存在重复的报销项目',
    category: SkillCategory.VALIDATION,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    triggers: [
      { type: SkillTrigger.ON_EXPENSE_ADD },
      { type: SkillTrigger.ON_REIMBURSEMENT_SUBMIT },
    ],
    executor: {
      type: 'javascript',
      code: `
        // 这里应该查询数据库检查重复
        // 简化示例：检查同一天同一金额的费用
        const item = context.expenseItem;
        if (!item) return { isDuplicate: false };

        // 实际实现需要调用数据库
        return {
          isDuplicate: false,
          message: '未检测到重复报销',
        };
      `,
    },
    permissions: [
      { resource: 'reimbursement', actions: ['read'] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建智能分类 Skill
 */
export function createSmartCategorizerSkill(tenantId: string): Skill {
  return {
    id: 'builtin_smart_categorizer',
    tenantId,
    name: '智能费用分类',
    description: '使用 AI 自动识别费用类别',
    category: SkillCategory.AI_ENHANCEMENT,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    triggers: [
      { type: SkillTrigger.ON_RECEIPT_UPLOAD },
    ],
    executor: {
      type: 'ai_prompt',
      prompt: `分析以下票据信息，判断费用类别：

票据信息：{{receipt}}

可选类别：
- flight: 机票
- train: 火车票
- hotel: 酒店住宿
- meal: 餐饮
- taxi: 出租车/网约车
- office_supplies: 办公用品
- ai_token: AI Token 消耗
- cloud_resource: 云资源费用

请返回 JSON 格式：
{ "category": "类别代码", "confidence": 0.0-1.0, "reason": "判断理由" }`,
    },
    permissions: [
      { resource: 'receipt', actions: ['read'] },
      { resource: 'reimbursement', actions: ['write'] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 获取所有内置 Skills
 */
export function getBuiltInSkills(tenantId: string): Skill[] {
  return [
    createMileageCalculatorSkill(tenantId),
    createDuplicateDetectorSkill(tenantId),
    createSmartCategorizerSkill(tenantId),
  ];
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createSkillManager(
  tenantId: string,
  customSkills: Skill[] = []
): SkillManager {
  const builtInSkills = getBuiltInSkills(tenantId);
  return new SkillManager([...builtInSkills, ...customSkills]);
}
