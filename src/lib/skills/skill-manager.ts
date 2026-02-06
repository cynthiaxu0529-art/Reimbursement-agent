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
 * 创建发票学习收集 Skill
 * 收集发票样本数据用于模型改进
 */
export function createInvoiceLearnerSkill(tenantId: string): Skill {
  return {
    id: 'builtin_invoice_learner',
    tenantId,
    name: '发票样本学习',
    description: '收集发票识别结果用于持续改进识别准确率',
    category: SkillCategory.AI_ENHANCEMENT,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    triggers: [
      { type: SkillTrigger.ON_RECEIPT_UPLOAD },
    ],
    executor: {
      type: 'javascript',
      code: `
        // 收集发票识别结果用于学习
        const receipt = context.receipt;
        if (!receipt) return { collected: false };

        const sample = {
          tenantId: context.tenant.id,
          country: receipt.documentCountry || 'CN',
          type: receipt.type,
          category: receipt.category,
          isOfficialInvoice: receipt.isOfficialInvoice,
          invoiceValidation: receipt.invoiceValidation,
          confidence: receipt.confidence,
          vendor: receipt.vendor,
          amount: receipt.amount,
          currency: receipt.currency,
          // 用于训练的特征
          features: {
            hasInvoiceCode: receipt.invoiceValidation?.hasInvoiceCode,
            hasCheckCode: receipt.invoiceValidation?.hasCheckCode,
            hasTaxNumber: receipt.invoiceValidation?.hasTaxNumber,
            hasQRCode: receipt.invoiceValidation?.hasQRCode,
          },
          collectedAt: new Date().toISOString(),
        };

        // 异步发送到学习服务（不阻塞主流程）
        fetch('/api/skills/invoice-learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sample),
        }).catch(console.error);

        return {
          collected: true,
          country: sample.country,
          type: sample.type,
        };
      `,
    },
    permissions: [
      { resource: 'receipt', actions: ['read'] },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建预算预警通知 Skill
 * 检测技术费用是否接近或超过月度预算限额
 */
export function createBudgetAlertSkill(tenantId: string): Skill {
  return {
    id: 'builtin_budget_alert',
    tenantId,
    name: '预算预警通知',
    description: '检测技术费用是否接近或超过月度预算限额，避免超支',
    category: SkillCategory.NOTIFICATION,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    triggers: [
      { type: SkillTrigger.ON_SCHEDULE }, // 定时触发（每日）
      { type: SkillTrigger.ON_EXPENSE_ADD, conditions: [
        { field: 'expenseItem.category', operator: 'in', value: ['ai_token', 'cloud_resource', 'software', 'api_service', 'hosting'] },
      ]},
      { type: SkillTrigger.ON_CHAT_COMMAND }, // AI 助手触发
    ],
    executor: {
      type: 'javascript',
      code: `
        // 获取技术费用类别
        const TECH_CATEGORIES = ['ai_token', 'cloud_resource', 'software', 'api_service', 'hosting', 'domain'];

        // 从 context.params 获取当前月度费用数据
        const monthlyExpenses = context.params?.monthlyExpenses || {};
        const budgetLimits = context.params?.budgetLimits || {
          ai_token: 5000,      // AI Token 月度限额
          cloud_resource: 10000, // 云资源月度限额
          software: 3000,       // 软件订阅月度限额
          total_tech: 20000,    // 技术费用总限额
        };

        const alerts = [];
        let totalTechExpense = 0;

        // 检查各类别预算
        for (const category of TECH_CATEGORIES) {
          const spent = monthlyExpenses[category] || 0;
          const limit = budgetLimits[category];
          totalTechExpense += spent;

          if (limit) {
            const percentage = (spent / limit) * 100;

            if (percentage >= 100) {
              alerts.push({
                level: 'critical',
                category,
                message: category + ' 费用已超支！已使用 ¥' + spent.toFixed(2) + '，限额 ¥' + limit,
                percentage: percentage.toFixed(1),
                spent,
                limit,
              });
            } else if (percentage >= 80) {
              alerts.push({
                level: 'warning',
                category,
                message: category + ' 费用已达 ' + percentage.toFixed(1) + '%，请注意控制',
                percentage: percentage.toFixed(1),
                spent,
                limit,
              });
            } else if (percentage >= 60) {
              alerts.push({
                level: 'info',
                category,
                message: category + ' 费用已使用 ' + percentage.toFixed(1) + '%',
                percentage: percentage.toFixed(1),
                spent,
                limit,
              });
            }
          }
        }

        // 检查技术费用总预算
        const totalLimit = budgetLimits.total_tech;
        if (totalLimit) {
          const totalPercentage = (totalTechExpense / totalLimit) * 100;
          if (totalPercentage >= 80) {
            alerts.unshift({
              level: totalPercentage >= 100 ? 'critical' : 'warning',
              category: 'total_tech',
              message: '技术费用总计已达 ' + totalPercentage.toFixed(1) + '% (¥' + totalTechExpense.toFixed(2) + ' / ¥' + totalLimit + ')',
              percentage: totalPercentage.toFixed(1),
              spent: totalTechExpense,
              limit: totalLimit,
            });
          }
        }

        return {
          hasAlerts: alerts.length > 0,
          alertCount: alerts.length,
          criticalCount: alerts.filter(a => a.level === 'critical').length,
          warningCount: alerts.filter(a => a.level === 'warning').length,
          alerts,
          summary: {
            totalTechExpense,
            totalLimit,
            usagePercentage: totalLimit ? ((totalTechExpense / totalLimit) * 100).toFixed(1) : null,
          },
        };
      `,
    },
    inputSchema: {
      type: 'object',
      properties: {
        monthlyExpenses: { type: 'object', description: '当月各类别费用' },
        budgetLimits: { type: 'object', description: '各类别预算限额' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        hasAlerts: { type: 'boolean', description: '是否有预警' },
        alertCount: { type: 'number', description: '预警数量' },
        alerts: { type: 'array', description: '预警详情列表' },
      },
    },
    permissions: [
      { resource: 'reimbursement', actions: ['read'] },
    ],
    configSchema: {
      fields: [
        { key: 'ai_token_limit', type: 'number', label: 'AI Token 月度限额', default: 5000 },
        { key: 'cloud_resource_limit', type: 'number', label: '云资源月度限额', default: 10000 },
        { key: 'software_limit', type: 'number', label: '软件订阅月度限额', default: 3000 },
        { key: 'total_tech_limit', type: 'number', label: '技术费用总限额', default: 20000 },
        { key: 'warning_threshold', type: 'number', label: '预警阈值(%)', default: 80 },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 创建异常消费检测 Skill
 * 检测异常高额的技术费用支出
 */
export function createAnomalyDetectorSkill(tenantId: string): Skill {
  return {
    id: 'builtin_anomaly_detector',
    tenantId,
    name: '异常消费检测',
    description: '检测异常高额的技术费用支出，及时发现问题',
    category: SkillCategory.VALIDATION,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    triggers: [
      { type: SkillTrigger.ON_EXPENSE_ADD, conditions: [
        { field: 'expenseItem.category', operator: 'in', value: ['ai_token', 'cloud_resource', 'software', 'api_service', 'hosting'] },
      ]},
      { type: SkillTrigger.ON_REIMBURSEMENT_SUBMIT },
      { type: SkillTrigger.ON_CHAT_COMMAND },
    ],
    executor: {
      type: 'javascript',
      code: `
        const TECH_CATEGORIES = ['ai_token', 'cloud_resource', 'software', 'api_service', 'hosting', 'domain'];

        // 获取历史平均值和当前费用
        const historicalAvg = context.params?.historicalAvg || {};
        const currentExpenses = context.params?.currentExpenses || [];
        const thresholdMultiplier = context.params?.thresholdMultiplier || 2.0; // 超过平均值2倍视为异常

        const anomalies = [];

        // ========== 1. 重复提交检测 ==========
        const expenseKeys = new Map(); // 用于检测重复
        const duplicates = [];

        for (const expense of currentExpenses) {
          // 生成唯一键：供应商 + 金额 + 日期（精确到天）
          const dateStr = expense.date ? new Date(expense.date).toISOString().split('T')[0] : '';
          const key = (expense.vendor || '') + '|' + expense.amount + '|' + dateStr;

          if (expenseKeys.has(key)) {
            const existing = expenseKeys.get(key);
            // 标记为潜在重复
            if (!duplicates.find(d => d.key === key)) {
              duplicates.push({
                key,
                items: [existing, expense],
                vendor: expense.vendor,
                amount: expense.amount,
                date: dateStr,
              });
            } else {
              duplicates.find(d => d.key === key).items.push(expense);
            }
          } else {
            expenseKeys.set(key, expense);
          }
        }

        // 添加重复提交异常
        for (const dup of duplicates) {
          anomalies.push({
            type: 'duplicate',
            level: 'warning',
            vendor: dup.vendor,
            amount: dup.amount,
            date: dup.date,
            count: dup.items.length,
            message: '检测到疑似重复提交：' + (dup.vendor || '未知供应商') + ' ¥' + dup.amount.toFixed(2) + ' (' + dup.date + ') 出现 ' + dup.items.length + ' 次',
            suggestion: '请核实这 ' + dup.items.length + ' 笔费用是否为同一笔消费的重复提交',
            items: dup.items.map(i => i.id),
          });
        }

        // ========== 2. 高额异常检测 ==========
        for (const expense of currentExpenses) {
          if (!TECH_CATEGORIES.includes(expense.category)) continue;

          const avgAmount = historicalAvg[expense.category]?.avgAmount || 0;
          const stdDev = historicalAvg[expense.category]?.stdDev || avgAmount * 0.5;

          // 异常检测：超过平均值 + N倍标准差
          const threshold = avgAmount + (stdDev * thresholdMultiplier);

          if (avgAmount > 0 && expense.amount > threshold) {
            const ratio = expense.amount / avgAmount;
            anomalies.push({
              type: 'high_amount',
              id: expense.id,
              category: expense.category,
              vendor: expense.vendor,
              amount: expense.amount,
              avgAmount: avgAmount.toFixed(2),
              threshold: threshold.toFixed(2),
              ratio: ratio.toFixed(1),
              level: ratio > 5 ? 'critical' : ratio > 3 ? 'warning' : 'info',
              message: (expense.vendor || '未知') + ' 消费 ¥' + expense.amount.toFixed(2) + ' 是历史平均的 ' + ratio.toFixed(1) + ' 倍',
              suggestion: ratio > 3
                ? '建议核实此笔费用是否正常，可能存在异常消费或错误录入'
                : '此笔费用高于平均水平，建议关注',
            });
          }
        }

        // ========== 3. 供应商集中度检测 ==========
        const vendorSpending = {};
        let totalAmount = 0;
        for (const expense of currentExpenses) {
          if (!TECH_CATEGORIES.includes(expense.category)) continue;
          const vendor = expense.vendor || '未知';
          vendorSpending[vendor] = (vendorSpending[vendor] || 0) + expense.amount;
          totalAmount += expense.amount;
        }

        // 单一供应商占比超过70%视为集中度过高
        for (const [vendor, amount] of Object.entries(vendorSpending)) {
          const percentage = (amount / totalAmount) * 100;
          if (percentage > 70 && totalAmount > 1000) {
            anomalies.push({
              type: 'concentration',
              vendor,
              amount,
              percentage: percentage.toFixed(1),
              level: 'info',
              message: vendor + ' 占技术费用的 ' + percentage.toFixed(1) + '%，供应商集中度较高',
              suggestion: '建议评估是否需要分散供应商风险',
            });
          }
        }

        // ========== 4. 月度突增检测 ==========
        const lastMonthTotal = context.params?.lastMonthTotal || 0;
        const currentTotal = totalAmount;
        if (lastMonthTotal > 0 && currentTotal > lastMonthTotal * 1.5) {
          const growthRate = ((currentTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1);
          anomalies.unshift({
            type: 'monthly_spike',
            level: currentTotal > lastMonthTotal * 2 ? 'warning' : 'info',
            currentTotal,
            lastMonthTotal,
            growthRate,
            message: '本月技术费用较上月增长 ' + growthRate + '%',
            suggestion: '建议分析费用增长原因',
          });
        }

        // 统计各类异常数量
        const duplicateCount = anomalies.filter(a => a.type === 'duplicate').length;

        return {
          hasAnomalies: anomalies.length > 0,
          anomalyCount: anomalies.length,
          criticalCount: anomalies.filter(a => a.level === 'critical').length,
          warningCount: anomalies.filter(a => a.level === 'warning').length,
          duplicateCount,
          anomalies,
          summary: {
            totalAnalyzed: currentExpenses.length,
            totalAmount,
            lastMonthTotal,
            duplicateCount,
          },
        };
      `,
    },
    inputSchema: {
      type: 'object',
      properties: {
        currentExpenses: { type: 'array', description: '当前待检测的费用列表' },
        historicalAvg: { type: 'object', description: '各类别历史平均值' },
        lastMonthTotal: { type: 'number', description: '上月技术费用总额' },
        thresholdMultiplier: { type: 'number', description: '异常阈值倍数', default: 2.0 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        hasAnomalies: { type: 'boolean', description: '是否检测到异常' },
        anomalyCount: { type: 'number', description: '异常数量' },
        anomalies: { type: 'array', description: '异常详情列表' },
      },
    },
    permissions: [
      { resource: 'reimbursement', actions: ['read'] },
    ],
    configSchema: {
      fields: [
        { key: 'threshold_multiplier', type: 'number', label: '异常阈值倍数', default: 2.0 },
        { key: 'min_amount_check', type: 'number', label: '最小检测金额', default: 100 },
        { key: 'concentration_threshold', type: 'number', label: '供应商集中度阈值(%)', default: 70 },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 报销时效性分析 Skill
 * 分析费用发生日期到提交日期的时间间隔，识别报销延迟问题
 */
export function createTimelinessAnalysisSkill(tenantId: string): Skill {
  return {
    id: 'builtin_timeliness_analysis',
    tenantId,
    name: '报销时效性分析',
    description: '分析费用发生到报销提交的时间间隔，识别跨期报销和延迟提交问题',
    category: SkillCategory.ANALYTICS,
    version: '1.0.0',
    isActive: true,
    isBuiltIn: true,
    permissions: [],
    triggers: [
      { type: SkillTrigger.ON_REIMBURSEMENT_SUBMIT },
      { type: SkillTrigger.ON_CHAT_COMMAND },
    ],
    executor: {
      type: 'javascript',
      code: `
        // 报销时效性分析
        const expenses = context.params?.expenses || [];
        const submittedAt = context.reimbursement?.submittedAt || new Date();

        const timelinessData = [];
        let totalDays = 0;

        for (const expense of expenses) {
          if (!expense.date) continue;

          const expenseDate = new Date(expense.date);
          const submitDate = new Date(submittedAt);
          const daysDiff = Math.floor((submitDate - expenseDate) / (1000 * 60 * 60 * 24));

          if (daysDiff >= 0) {
            timelinessData.push({
              id: expense.id,
              category: expense.category,
              vendor: expense.vendor,
              amount: expense.amount,
              expenseDate: expense.date,
              daysDiff,
              level: daysDiff <= 7 ? 'excellent' : daysDiff <= 30 ? 'good' : daysDiff <= 60 ? 'warning' : 'critical',
            });
            totalDays += daysDiff;
          }
        }

        if (timelinessData.length === 0) {
          return {
            success: true,
            data: {
              hasIssues: false,
              message: '无有效的时效性数据',
            },
          };
        }

        const avgDays = totalDays / timelinessData.length;
        const maxDays = Math.max(...timelinessData.map(d => d.daysDiff));
        const within7Days = timelinessData.filter(d => d.daysDiff <= 7).length;
        const within30Days = timelinessData.filter(d => d.daysDiff <= 30).length;
        const over30Days = timelinessData.filter(d => d.daysDiff > 30);
        const over60Days = timelinessData.filter(d => d.daysDiff > 60);
        const over90Days = timelinessData.filter(d => d.daysDiff > 90);

        const complianceRate = (within30Days / timelinessData.length) * 100;

        // 判断是否有时效性问题
        const hasIssues = over30Days.length > 0 || avgDays > 30;

        // 生成建议
        const suggestions = [];
        if (over60Days.length > 0) {
          suggestions.push({
            level: 'critical',
            message: '发现 ' + over60Days.length + ' 笔超过60天的跨期报销',
            items: over60Days.map(d => ({
              vendor: d.vendor,
              amount: d.amount,
              days: d.daysDiff,
              expenseDate: d.expenseDate,
            })),
            suggestion: '跨期报销可能影响财务核算准确性，建议尽快提交报销或说明延迟原因',
          });
        } else if (over30Days.length > 0) {
          suggestions.push({
            level: 'warning',
            message: '发现 ' + over30Days.length + ' 笔超过30天的延迟报销',
            items: over30Days.map(d => ({
              vendor: d.vendor,
              amount: d.amount,
              days: d.daysDiff,
              expenseDate: d.expenseDate,
            })),
            suggestion: '建议及时提交报销，避免报销过期或财务处理困难',
          });
        }

        if (complianceRate < 80) {
          suggestions.push({
            level: 'warning',
            message: '当前报销30天内提交率仅 ' + complianceRate.toFixed(1) + '%',
            suggestion: '建议提醒员工在费用发生后30天内提交报销，提高财务处理效率',
          });
        }

        return {
          success: true,
          data: {
            hasIssues,
            summary: {
              totalCount: timelinessData.length,
              avgDays: Math.round(avgDays * 10) / 10,
              maxDays,
              within7Days,
              within30Days,
              over30Days: over30Days.length,
              over60Days: over60Days.length,
              over90Days: over90Days.length,
              complianceRate: Math.round(complianceRate * 10) / 10,
            },
            suggestions,
            details: timelinessData,
          },
        };
      `,
    },
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
    createInvoiceLearnerSkill(tenantId),
    createBudgetAlertSkill(tenantId),
    createAnomalyDetectorSkill(tenantId),
    createTimelinessAnalysisSkill(tenantId),
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

/**
 * 从数据库动态加载自定义 Skill 并合并内置 Skill
 * 支持数据库中对内置 Skill 的配置覆盖（isActive, config）
 */
export async function createSkillManagerWithDB(
  tenantId: string
): Promise<SkillManager> {
  // 延迟导入避免循环依赖
  const { db } = await import('@/lib/db');
  const { skills: skillsTable } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // 获取内置 Skills
  const builtInSkills = getBuiltInSkills(tenantId);

  // 从数据库加载自定义和覆盖配置
  const dbSkills = await db.query.skills.findMany({
    where: eq(skillsTable.tenantId, tenantId),
  });

  // 数据库中的内置 Skill 覆盖记录 (id 以 builtin_ 开头)
  const builtInOverrides = new Map<string, typeof dbSkills[0]>();
  // 数据库中的自定义 Skill
  const customDbSkills: Skill[] = [];

  for (const dbSkill of dbSkills) {
    if (dbSkill.isBuiltIn) {
      builtInOverrides.set(dbSkill.id, dbSkill);
    } else {
      // 将数据库记录转换为 Skill 类型
      customDbSkills.push({
        id: dbSkill.id,
        tenantId: dbSkill.tenantId,
        name: dbSkill.name,
        description: dbSkill.description || '',
        category: dbSkill.category as any,
        icon: dbSkill.icon || undefined,
        version: dbSkill.version,
        author: dbSkill.author || undefined,
        triggers: (dbSkill.triggers || []) as any,
        executor: dbSkill.executor as any,
        inputSchema: dbSkill.inputSchema as any,
        outputSchema: dbSkill.outputSchema as any,
        permissions: (dbSkill.permissions || []) as any,
        isActive: dbSkill.isActive,
        isBuiltIn: false,
        config: dbSkill.config as any,
        configSchema: dbSkill.configSchema as any,
        stats: dbSkill.stats as any,
        createdAt: dbSkill.createdAt,
        updatedAt: dbSkill.updatedAt,
      });
    }
  }

  // 应用内置 Skill 的数据库覆盖配置
  const mergedBuiltIn = builtInSkills.map(skill => {
    const override = builtInOverrides.get(skill.id);
    if (override) {
      return {
        ...skill,
        isActive: override.isActive,
        config: (override.config as any) || skill.config,
      };
    }
    return skill;
  });

  return new SkillManager([...mergedBuiltIn, ...customDbSkills]);
}
