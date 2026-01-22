/**
 * 报销政策规则引擎
 * 支持通过 chat 定义政策，自动检查规则完整性
 */

import type {
  Policy,
  PolicyRule,
  PolicyCompletenessCheck,
  ReimbursementItem,
  PolicyCheckResult,
  ComplianceIssue,
  ExpenseCategoryType,
  CurrencyType,
  RuleCondition,
  RuleLimit,
} from '@/types';
import { ExpenseCategory, Currency } from '@/types';
import { exchangeRateService } from '@/lib/currency/exchange-service';

// ============================================================================
// 规则完整性检查
// ============================================================================

/**
 * 规则必需字段定义
 */
const REQUIRED_RULE_FIELDS: {
  field: keyof PolicyRule;
  description: string;
  suggestion: string;
}[] = [
  {
    field: 'name',
    description: '规则名称',
    suggestion: '请为规则添加一个描述性的名称，如"差旅机票限额"',
  },
  {
    field: 'category',
    description: '适用的费用类别',
    suggestion: '请指定此规则适用于哪个费用类别，如 flight、hotel、meal 等',
  },
  {
    field: 'limit',
    description: '费用限额',
    suggestion: '请设置费用限额，如每日/每次/每月的最大金额',
  },
  {
    field: 'message',
    description: '违规提示信息',
    suggestion: '请添加当违反此规则时显示给用户的提示信息',
  },
];

/**
 * 检查单个规则的完整性
 */
export function checkRuleCompleteness(rule: Partial<PolicyRule>): {
  isComplete: boolean;
  missingFields: string[];
  suggestions: string[];
} {
  const missingFields: string[] = [];
  const suggestions: string[] = [];

  for (const { field, description, suggestion } of REQUIRED_RULE_FIELDS) {
    if (rule[field] === undefined || rule[field] === null || rule[field] === '') {
      missingFields.push(description);
      suggestions.push(suggestion);
    }
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    suggestions,
  };
}

/**
 * 检查政策的完整性
 */
export function checkPolicyCompleteness(policy: Policy): PolicyCompletenessCheck {
  const allCategories = Object.values(ExpenseCategory);
  const coveredCategories = new Set<ExpenseCategoryType>();
  const incompleteRules: PolicyCompletenessCheck['incompleteRules'] = [];

  for (const rule of policy.rules) {
    if (rule.category) {
      coveredCategories.add(rule.category);
    }

    const ruleCheck = checkRuleCompleteness(rule);
    if (!ruleCheck.isComplete) {
      incompleteRules.push({
        ruleId: rule.id,
        ruleName: rule.name || '未命名规则',
        missingFields: ruleCheck.missingFields,
        suggestion: ruleCheck.suggestions[0] || '',
      });
    }
  }

  const missingCategories = allCategories.filter((c) => !coveredCategories.has(c));

  const suggestions: string[] = [];

  if (missingCategories.length > 0) {
    suggestions.push(
      `以下费用类别尚未设置规则：${missingCategories.slice(0, 5).join('、')}${
        missingCategories.length > 5 ? '等' : ''
      }`
    );
  }

  if (incompleteRules.length > 0) {
    suggestions.push(`有 ${incompleteRules.length} 条规则信息不完整，请补充完善`);
  }

  return {
    isComplete: missingCategories.length === 0 && incompleteRules.length === 0,
    missingCategories,
    incompleteRules,
    suggestions,
  };
}

// ============================================================================
// 政策检查引擎
// ============================================================================

/**
 * 政策引擎类
 */
export class PolicyEngine {
  private policies: Policy[];
  private baseCurrency: CurrencyType;

  constructor(policies: Policy[], baseCurrency: CurrencyType = Currency.CNY) {
    // 按优先级排序
    this.policies = [...policies].sort((a, b) => a.priority - b.priority);
    this.baseCurrency = baseCurrency;
  }

  /**
   * 检查单个报销项
   */
  async checkItem(
    item: ReimbursementItem,
    context?: {
      userId?: string;
      department?: string;
      tripType?: string;
    }
  ): Promise<PolicyCheckResult> {
    for (const policy of this.policies) {
      if (!policy.isActive) continue;

      for (const rule of policy.rules) {
        if (!this.ruleApplies(rule, item, context)) continue;

        const result = await this.evaluateRule(rule, item);
        if (!result.passed) {
          return result;
        }
      }
    }

    return { passed: true };
  }

  /**
   * 检查整个报销单
   */
  async checkReimbursement(
    items: ReimbursementItem[],
    context?: {
      userId?: string;
      department?: string;
      tripType?: string;
    }
  ): Promise<{
    passed: boolean;
    issues: ComplianceIssue[];
  }> {
    const issues: ComplianceIssue[] = [];

    // 检查每个项目
    for (const item of items) {
      const result = await this.checkItem(item, context);
      if (!result.passed) {
        issues.push({
          id: crypto.randomUUID(),
          ruleId: result.ruleId || '',
          ruleName: result.ruleName || '',
          severity: result.severity || 'warning',
          message: result.message || '',
          suggestion: this.getSuggestion(result),
          itemId: item.id,
          autoResolvable: false,
        });
      }
    }

    // 检查聚合规则（如每日/每月限额）
    const aggregateIssues = await this.checkAggregateRules(items, context);
    issues.push(...aggregateIssues);

    return {
      passed: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
    };
  }

  /**
   * 判断规则是否适用
   */
  private ruleApplies(
    rule: PolicyRule,
    item: ReimbursementItem,
    context?: { userId?: string; department?: string; tripType?: string }
  ): boolean {
    // 检查类别
    if (rule.category && rule.category !== item.category) {
      return false;
    }

    // 检查部门
    if (rule.department && context?.department !== rule.department) {
      return false;
    }

    // 检查行程类型
    if (rule.tripType && context?.tripType !== rule.tripType) {
      return false;
    }

    return true;
  }

  /**
   * 评估规则
   */
  private async evaluateRule(
    rule: PolicyRule,
    item: ReimbursementItem
  ): Promise<PolicyCheckResult> {
    // 检查限额
    if (rule.limit) {
      const result = await this.checkLimit(rule, item);
      if (!result.passed) {
        return result;
      }
    }

    // 检查条件
    if (rule.condition) {
      const result = this.checkCondition(rule, item);
      if (!result.passed) {
        return result;
      }
    }

    // 检查票据要求
    if (rule.requiresReceipt && !item.receiptId) {
      return {
        passed: false,
        ruleId: rule.id,
        ruleName: rule.name,
        message: rule.message || '此类费用需要提供票据',
        severity: 'warning',
      };
    }

    return { passed: true };
  }

  /**
   * 检查限额
   */
  private async checkLimit(
    rule: PolicyRule,
    item: ReimbursementItem
  ): Promise<PolicyCheckResult> {
    if (!rule.limit) return { passed: true };

    // 转换为统一货币进行比较
    let amountToCheck = item.amountInBaseCurrency;

    // 检查城市特定限额
    let limitAmount = rule.limit.amount;
    if (rule.limit.conditions?.city && item.location) {
      const cityLimit = this.getCitySpecificLimit(rule.limit, item.location);
      if (cityLimit !== null) {
        limitAmount = cityLimit;
      }
    }

    if (amountToCheck > limitAmount) {
      const overAmount = amountToCheck - limitAmount;
      return {
        passed: false,
        ruleId: rule.id,
        ruleName: rule.name,
        message: rule.message || `超出限额 ${limitAmount} ${rule.limit.currency}`,
        severity: 'warning',
        actualValue: amountToCheck,
        limitValue: limitAmount,
        overAmount,
      };
    }

    return { passed: true };
  }

  /**
   * 获取城市特定限额
   */
  private getCitySpecificLimit(limit: RuleLimit, location: string): number | null {
    if (!limit.conditions?.city) return null;

    // 一线城市
    const tier1Cities = ['北京', '上海', '广州', '深圳', 'Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen'];

    for (const city of tier1Cities) {
      if (location.includes(city)) {
        // 一线城市通常限额更高，这里假设高 60%
        return limit.amount * 1.6;
      }
    }

    return null;
  }

  /**
   * 检查条件
   */
  private checkCondition(rule: PolicyRule, item: ReimbursementItem): PolicyCheckResult {
    if (!rule.condition) return { passed: true };

    const { type, operator, value, valueEnd } = rule.condition;
    let actualValue: any;

    switch (type) {
      case 'amount':
        actualValue = item.amountInBaseCurrency;
        break;
      case 'date':
        actualValue = item.date;
        break;
      case 'location':
        actualValue = item.location;
        break;
      default:
        return { passed: true };
    }

    const passed = this.evaluateOperator(operator, actualValue, value, valueEnd);

    if (!passed) {
      return {
        passed: false,
        ruleId: rule.id,
        ruleName: rule.name,
        message: rule.message || '不满足条件要求',
        severity: 'warning',
        actualValue,
        limitValue: value,
      };
    }

    return { passed: true };
  }

  /**
   * 评估操作符
   */
  private evaluateOperator(
    operator: RuleCondition['operator'],
    actual: any,
    expected: any,
    expectedEnd?: any
  ): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'between':
        return actual >= expected && actual <= expectedEnd;
      default:
        return true;
    }
  }

  /**
   * 检查聚合规则
   */
  private async checkAggregateRules(
    items: ReimbursementItem[],
    context?: { userId?: string; department?: string; tripType?: string }
  ): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];

    // 按日期分组检查每日限额
    const byDate = this.groupByDate(items);
    for (const [date, dateItems] of Object.entries(byDate)) {
      // 按类别检查每日限额
      const byCategory = this.groupByCategory(dateItems);
      for (const [category, categoryItems] of Object.entries(byCategory)) {
        const dailyTotal = categoryItems.reduce((sum, item) => sum + item.amountInBaseCurrency, 0);

        // 查找适用的每日限额规则
        for (const policy of this.policies) {
          for (const rule of policy.rules) {
            if (
              rule.category === category &&
              rule.limit?.type === 'per_day' &&
              dailyTotal > rule.limit.amount
            ) {
              issues.push({
                id: crypto.randomUUID(),
                ruleId: rule.id,
                ruleName: rule.name,
                severity: 'warning',
                message: `${date} 的 ${category} 费用合计 ${dailyTotal} 超出每日限额 ${rule.limit.amount}`,
                autoResolvable: false,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * 按日期分组
   */
  private groupByDate(items: ReimbursementItem[]): Record<string, ReimbursementItem[]> {
    const groups: Record<string, ReimbursementItem[]> = {};
    for (const item of items) {
      const dateKey = item.date.toISOString().split('T')[0];
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(item);
    }
    return groups;
  }

  /**
   * 按类别分组
   */
  private groupByCategory(items: ReimbursementItem[]): Record<string, ReimbursementItem[]> {
    const groups: Record<string, ReimbursementItem[]> = {};
    for (const item of items) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }
    return groups;
  }

  /**
   * 生成建议
   */
  private getSuggestion(result: PolicyCheckResult): string {
    if (result.overAmount) {
      return `超出限额 ${result.overAmount}，请检查费用是否合理或申请特殊审批`;
    }
    return '请检查此项费用是否符合公司报销政策';
  }
}

// ============================================================================
// Chat 政策解析器
// ============================================================================

/**
 * 从自然语言解析政策规则
 * 用于支持通过 chat 定义政策
 */
export interface ParsedPolicyFromChat {
  name: string;
  rules: Partial<PolicyRule>[];
  rawPrompt: string;
  parseConfidence: number;
  clarificationNeeded?: string[];
}

/**
 * 政策解析提示词
 */
export const POLICY_PARSING_PROMPT = `你是一个报销政策解析助手。用户会用自然语言描述报销政策，你需要将其解析为结构化的规则。

可用的费用类别:
- flight: 机票
- train: 火车票
- hotel: 酒店住宿
- meal: 餐饮
- taxi: 出租车/网约车
- ai_token: AI Token 消耗
- cloud_resource: 云资源费用
- office_supplies: 办公用品
- 其他类别...

规则结构:
{
  "name": "规则名称",
  "category": "费用类别",
  "limit": {
    "type": "per_item | per_day | per_trip | per_month",
    "amount": 金额数字,
    "currency": "CNY | USD | ..."
  },
  "conditions": { ... },
  "message": "违规提示",
  "requiresReceipt": true/false,
  "requiresApproval": true/false
}

如果用户描述不完整，请列出需要澄清的问题。

用户输入: {user_input}

请返回 JSON 格式的解析结果。`;

/**
 * 政策完整性提醒消息生成
 */
export function generateCompletenessReminder(check: PolicyCompletenessCheck): string {
  if (check.isComplete) {
    return '✅ 政策配置完整';
  }

  const messages: string[] = ['⚠️ 政策配置不完整，请补充以下内容：\n'];

  if (check.incompleteRules.length > 0) {
    messages.push('**规则缺失字段：**');
    for (const rule of check.incompleteRules) {
      messages.push(`- ${rule.ruleName}: 缺少 ${rule.missingFields.join('、')}`);
      messages.push(`  💡 ${rule.suggestion}`);
    }
    messages.push('');
  }

  if (check.missingCategories.length > 0) {
    messages.push('**未覆盖的费用类别：**');
    messages.push(`- ${check.missingCategories.slice(0, 10).join('、')}`);
    if (check.missingCategories.length > 10) {
      messages.push(`- 还有 ${check.missingCategories.length - 10} 个类别未设置规则`);
    }
  }

  return messages.join('\n');
}
