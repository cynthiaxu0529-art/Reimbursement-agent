'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: TechExpenseData | PolicyData | null;
  dataType?: 'tech_expense' | 'policy' | 'vendor';
  actions?: {
    type: string;
    label: string;
    onClick?: () => void;
  }[];
}

interface TechExpenseData {
  period?: {
    start: string;
    end: string;
    label: string;
    dateFilterType?: string;
  };
  summary: {
    totalAmount: number;
    currency: string;
    categoryCount: number;
    vendorCount: number;
    lastMonthTotal?: number;
    monthOverMonthGrowth?: number;
    avgMonthlyAmount?: number;
    trendDirection?: 'up' | 'down' | 'stable';
  };
  comparison?: {
    lastMonth: {
      total: number;
      byCategory: {
        category: string;
        label: string;
        total: number;
      }[];
    };
    growth: {
      absolute: number;
      percentage: number;
    };
  };
  byCategory: {
    category: string;
    label: string;
    total: number;
    count: number;
    percentage: number;
    lastMonthTotal?: number;
    growth?: number;
    topVendors: { name: string; amount: number }[];
  }[];
  byVendor: {
    name: string;
    categoryLabel: string;
    totalAmount: number;
    count: number;
    userCount: number;
  }[];
  monthlyTrend?: {
    month: string;
    amount: number;
  }[];
  aiTokenAnalysis: {
    total: number;
    suggestions: string[];
    topProviders: { name: string; totalAmount: number }[];
  };
  saasAnalysis: {
    total: number;
    activeSubscriptions: number;
    topSubscriptions: { name: string; totalAmount: number }[];
  };
  timelinessAnalysis?: {
    averageDays: number;
    maxDays: number;
    minDays: number;
    medianDays: number;
    within7Days: number;
    within30Days: number;
    over30Days: number;
    over60Days: number;
    over90Days: number;
    totalCount: number;
    complianceRate: number;
  };
  userRanking?: {
    name: string;
    total: number;
    topCategory: string | null;
  }[];
}

interface PolicyData {
  policies: {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
    rules: PolicyRule[];
  }[];
}

interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  categories?: string[];
  limit?: {
    type: string;
    amount: number;
    currency: string;
  };
  requiresReceipt?: boolean;
  requiresApproval?: boolean;
  message?: string;
}

const categoryLabels: Record<string, string> = {
  flight: '机票',
  train: '火车票',
  hotel: '酒店住宿',
  meal: '餐饮',
  taxi: '交通',
  ai_token: 'AI Token',
  cloud_resource: '云资源',
  software: '软件订阅',
  api_service: 'API 服务',
  hosting: '托管服务',
  domain: '域名',
  other: '其他',
};

const limitTypeLabels: Record<string, string> = {
  per_item: '单笔',
  per_day: '每日',
  per_month: '每月',
  per_trip: '每次出差',
  per_year: '每年',
};

const samplePrompts = [
  { text: '报销政策是什么', icon: '📋' },
  { text: '分析本月技术费用', icon: '📊' },
  { text: '预算预警检查', icon: '⚠️' },
  { text: '异常消费检测', icon: '🔍' },
];

const capabilities = [
  { icon: '📋', title: '政策查询', desc: '了解公司报销政策' },
  { icon: '📊', title: '费用分析', desc: '技术费用统计分析' },
  { icon: '⚠️', title: '预算预警', desc: '检测是否接近超支' },
  { icon: '🔍', title: '异常检测', desc: '发现异常消费' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是 Fluxa 智能助手。\n\n我可以帮你：\n• 查询公司报销政策\n• 分析技术费用（SaaS、AI Token、云资源）\n• 提供成本优化建议\n\n试试点击下方的快捷按钮，或直接问我问题。',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 获取报销政策
  const fetchPolicies = async (): Promise<PolicyData | null> => {
    try {
      const response = await fetch('/api/settings/policies');
      const result = await response.json();
      if (result.success && result.data) {
        return { policies: result.data };
      }
      return null;
    } catch (error) {
      console.error('Fetch policies error:', error);
      return null;
    }
  };

  // 获取技术费用分析（支持自定义日期范围）
  const fetchTechExpenses = async (
    scope: string = 'company',
    dateFilterType: string = 'expense_date', // 默认使用费用发生日期
    startDate?: string,
    endDate?: string
  ): Promise<TechExpenseData | null> => {
    try {
      let url = `/api/analytics/tech-expenses?scope=${scope}&dateFilterType=${dateFilterType}`;

      if (startDate && endDate) {
        url += `&period=custom&startDate=${startDate}&endDate=${endDate}`;
      } else {
        url += '&period=month';
      }

      const response = await fetch(url);
      const result = await response.json();
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('Fetch tech expenses error:', error);
      return null;
    }
  };

  // 解析用户输入中的月份信息
  const parseMonthsFromQuery = (query: string): { months: string[]; year: number } | null => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const lastYear = currentYear - 1;

    // 匹配月份模式：12月、1月、2月等
    const monthPattern = /(\d{1,2})月/g;
    const matches = [...query.matchAll(monthPattern)];

    if (matches.length === 0) return null;

    const months = matches.map(m => parseInt(m[1]));

    // 判断年份
    let year = currentYear;

    // 1. 明确提到去年
    if (query.includes('去年') || query.includes(lastYear.toString())) {
      year = lastYear;
    }
    // 2. 如果所有月份都大于当前月份，说明是去年的月份
    // 例如：当前2月，查询"11月和12月"应该是去年的
    else if (months.every(m => m > currentMonth)) {
      year = lastYear;
    }
    // 3. 12月和1-2月同时出现，可能是跨年对比（保持原逻辑）
    else if (months.includes(12) && months.some(m => m <= 2)) {
      // 这种情况在调用时单独处理
    }

    return { months: months.map(String), year };
  };

  // 格式化多月对比分析
  const formatMultiMonthComparison = (monthsData: { month: string; data: TechExpenseData }[]): string => {
    if (monthsData.length === 0) return '未找到数据。';

    const cs = monthsData[0].data.summary.currency === 'CNY' ? '¥'
      : monthsData[0].data.summary.currency === 'GBP' ? '£'
      : monthsData[0].data.summary.currency === 'EUR' ? '€' : '$';

    let response = `**📊 多月份技术费用对比分析**\n\n`;

    // 总览对比（使用表格格式）
    response += `**💰 总费用对比：**\n\n`;
    response += `| 月份 | 总费用 | 供应商数 | 类别数 |\n`;
    response += `|------|--------|---------|--------|\n`;
    monthsData.forEach(({ month, data }) => {
      response += `| ${month} | ${cs}${data.summary.totalAmount.toLocaleString()} | ${data.summary.vendorCount} | ${data.summary.categoryCount} |\n`;
    });
    response += '\n';

    // 计算变化
    if (monthsData.length === 2) {
      const [first, second] = monthsData;
      const diff = second.data.summary.totalAmount - first.data.summary.totalAmount;
      const growthRate = first.data.summary.totalAmount > 0
        ? Math.round((diff / first.data.summary.totalAmount) * 1000) / 10
        : 0;

      const icon = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
      response += `**📊 变化趋势：**\n`;
      response += `${icon} ${second.month} 较 ${first.month} ${diff >= 0 ? '增加' : '减少'} ${cs}${Math.abs(diff).toLocaleString()}`;
      if (growthRate !== 0) {
        response += ` (${growthRate > 0 ? '+' : ''}${growthRate}%)`;
      }
      response += '\n\n';
    }

    // 供应商对比
    response += `**🏢 供应商分布对比：**\n\n`;
    const allVendors = new Set<string>();
    monthsData.forEach(m => {
      m.data.byVendor.slice(0, 5).forEach(v => allVendors.add(v.name));
    });

    if (allVendors.size > 0) {
      response += `| 供应商 | ${monthsData.map(m => m.month).join(' | ')} |\n`;
      response += `|--------|${monthsData.map(() => '--------').join('|')}|\n`;

      Array.from(allVendors).forEach(vendorName => {
        response += `| ${vendorName} |`;

        monthsData.forEach(({ data }) => {
          const vendor = data.byVendor.find(v => v.name === vendorName);
          if (vendor) {
            response += ` ${cs}${vendor.totalAmount.toLocaleString()} |`;
          } else {
            response += ` ${cs}0 |`;
          }
        });
        response += '\n';
      });
      response += '\n';
    }

    // AI Token 详细对比
    const hasAIToken = monthsData.some(m => m.data.aiTokenAnalysis?.total > 0);
    if (hasAIToken) {
      response += `**🤖 AI Token 对比：**\n\n`;
      response += `| 月份 | AI费用 | 占总费用比 | 主要供应商 |\n`;
      response += `|------|--------|-----------|------------|\n`;

      monthsData.forEach(({ month, data }) => {
        const aiTotal = data.aiTokenAnalysis?.total || 0;
        const aiPercentage = data.summary.totalAmount > 0
          ? Math.round((aiTotal / data.summary.totalAmount) * 100)
          : 0;

        const topProvider = data.aiTokenAnalysis?.topProviders && data.aiTokenAnalysis.topProviders.length > 0
          ? data.aiTokenAnalysis.topProviders[0].name
          : '-';

        response += `| ${month} | ${cs}${aiTotal.toLocaleString()} | ${aiPercentage}% | ${topProvider} |\n`;
      });
      response += '\n';
    }

    // 按类别对比（表格格式）
    response += `**📦 按类别对比：**\n\n`;
    const allCategories = new Set<string>();
    monthsData.forEach(m => {
      m.data.byCategory.forEach(cat => {
        if (cat.total > 0) allCategories.add(cat.category);
      });
    });

    // 为每个类别创建对比表格
    Array.from(allCategories).forEach(category => {
      const categoryLabel = categoryLabels[category] || category;
      response += `**${categoryLabel}：**\n`;
      response += `| 月份 | 费用 | 占比 | 主要供应商 |\n`;
      response += `|------|------|------|------------|\n`;

      monthsData.forEach(({ month, data }) => {
        const catData = data.byCategory.find(c => c.category === category);
        if (catData) {
          const topVendor = catData.topVendors && catData.topVendors.length > 0
            ? catData.topVendors[0].name
            : '-';
          response += `| ${month} | ${cs}${catData.total.toLocaleString()} | ${catData.percentage}% | ${topVendor} |\n`;
        } else {
          response += `| ${month} | ${cs}0 | 0% | - |\n`;
        }
      });
      response += '\n';
    });

    // 优化建议
    response += `**💡 对比分析与建议：**\n\n`;

    if (monthsData.length === 2) {
      const [first, second] = monthsData;
      const diff = second.data.summary.totalAmount - first.data.summary.totalAmount;
      const growthRate = first.data.summary.totalAmount > 0
        ? Math.round((diff / first.data.summary.totalAmount) * 100)
        : 0;

      // 总体趋势分析
      if (Math.abs(growthRate) >= 30) {
        const direction = diff > 0 ? '增长' : '下降';
        response += `• ⚠️ **费用${direction}显著**：${second.month}较${first.month}${direction}${Math.abs(growthRate)}%（${diff >= 0 ? '+' : ''}${cs}${Math.abs(diff).toLocaleString()}），建议详细审查变化原因\n`;
      } else if (Math.abs(growthRate) >= 10) {
        const direction = diff > 0 ? '增长' : '下降';
        response += `• 📊 **费用${direction}**：${second.month}较${first.month}${direction}${Math.abs(growthRate)}%\n`;
      } else {
        response += `• ✅ **费用稳定**：${second.month}较${first.month}基本持平，成本控制良好\n`;
      }

      // 类别变化分析
      const categoryChanges: { category: string; change: number }[] = [];
      allCategories.forEach(category => {
        const firstCat = first.data.byCategory.find(c => c.category === category);
        const secondCat = second.data.byCategory.find(c => c.category === category);
        const firstTotal = firstCat?.total || 0;
        const secondTotal = secondCat?.total || 0;
        const change = secondTotal - firstTotal;

        if (Math.abs(change) > 0) {
          categoryChanges.push({
            category: categoryLabels[category] || category,
            change
          });
        }
      });

      if (categoryChanges.length > 0) {
        const topChanges = categoryChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
        response += `• 📈 **主要变化类别**：\n`;
        topChanges.forEach(({ category, change }) => {
          response += `  - ${category}: ${change >= 0 ? '+' : ''}${cs}${Math.abs(change).toLocaleString()}\n`;
        });
      }

      // 检查供应商变化
      const firstVendors = new Set(first.data.byVendor.map(v => v.name));
      const secondVendors = new Set(second.data.byVendor.map(v => v.name));
      const newVendors = Array.from(secondVendors).filter(v => !firstVendors.has(v));
      const removedVendors = Array.from(firstVendors).filter(v => !secondVendors.has(v));

      if (newVendors.length > 0) {
        response += `• 🆕 **新增供应商**：${newVendors.slice(0, 3).join('、')}\n`;
      }

      if (removedVendors.length > 0) {
        response += `• ❌ **停用供应商**：${removedVendors.slice(0, 3).join('、')}\n`;
      }
    }

    // 通用建议
    const latestData = monthsData[monthsData.length - 1].data;
    if (latestData.aiTokenAnalysis?.suggestions && latestData.aiTokenAnalysis.suggestions.length > 0) {
      response += `\n**优化建议：**\n`;
      latestData.aiTokenAnalysis.suggestions.forEach(s => {
        response += `• ${s}\n`;
      });
    }

    return response;
  };

  // 执行 Skill
  const executeSkill = async (skillId: string): Promise<any> => {
    try {
      const response = await fetch('/api/skills/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId }),
      });
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Execute skill error:', error);
      return null;
    }
  };

  // 格式化预算预警结果
  const formatBudgetAlertResponse = (result: any): string => {
    if (!result?.success || !result?.data) {
      return '获取预算预警数据失败，请稍后重试。';
    }

    const data = result.data;
    let response = '**⚠️ 预算预警检查**\n\n';

    if (!data.hasAlerts) {
      response += '✅ 当前技术费用预算使用正常，无预警。\n\n';
      if (data.summary) {
        response += `**预算使用情况：**\n`;
        response += `• 本月技术费用总计：$${data.summary.totalTechExpense?.toLocaleString() || 0}\n`;
        if (data.summary.totalLimit) {
          response += `• 预算限额：$${data.summary.totalLimit.toLocaleString()}\n`;
          response += `• 使用比例：${data.summary.usagePercentage || 0}%\n`;
        }
      }
      return response;
    }

    response += `检测到 **${data.alertCount}** 条预警`;
    if (data.criticalCount > 0) {
      response += `（其中 ${data.criticalCount} 条严重）`;
    }
    response += '\n\n';

    // 按级别排序显示预警
    const sortedAlerts = [...(data.alerts || [])].sort((a: any, b: any) => {
      const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      return (levelOrder[a.level] || 2) - (levelOrder[b.level] || 2);
    });

    for (const alert of sortedAlerts) {
      const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🟢';
      response += `${icon} **${categoryLabels[alert.category] || alert.category}**\n`;
      response += `   ${alert.message}\n\n`;
    }

    return response;
  };

  // 格式化异常检测结果
  const formatAnomalyResponse = (result: any): string => {
    if (!result?.success || !result?.data) {
      return '获取异常检测数据失败，请稍后重试。';
    }

    const data = result.data;
    let response = '**🔍 异常消费检测**\n\n';

    if (!data.hasAnomalies) {
      response += '✅ 未检测到异常消费，所有技术费用在正常范围内。\n\n';
      if (data.summary) {
        response += `**检测摘要：**\n`;
        response += `• 分析费用笔数：${data.summary.totalAnalyzed || 0}\n`;
        response += `• 本月总额：$${data.summary.totalAmount?.toLocaleString() || 0}\n`;
        if (data.summary.lastMonthTotal) {
          response += `• 上月总额：$${data.summary.lastMonthTotal.toLocaleString()}\n`;
        }
      }
      return response;
    }

    response += `检测到 **${data.anomalyCount}** 个异常`;
    if (data.criticalCount > 0) {
      response += `（其中 ${data.criticalCount} 个需要立即关注）`;
    }
    if (data.duplicateCount > 0) {
      response += `\n⚠️ 包含 **${data.duplicateCount}** 个疑似重复提交`;
    }
    response += '\n\n';

    // 按类型和级别分组显示
    const anomalies = data.anomalies || [];

    // 1. 先显示重复提交（优先级最高）
    const duplicates = anomalies.filter((a: any) => a.type === 'duplicate');
    if (duplicates.length > 0) {
      response += '**📋 疑似重复提交**\n';
      for (const dup of duplicates) {
        response += `🟡 ${dup.message}\n`;
        response += `   💡 ${dup.suggestion}\n\n`;
      }
    }

    // 2. 显示其他异常（按级别排序）
    const otherAnomalies = anomalies.filter((a: any) => a.type !== 'duplicate');
    const sortedAnomalies = [...otherAnomalies].sort((a: any, b: any) => {
      const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      return (levelOrder[a.level] || 2) - (levelOrder[b.level] || 2);
    });

    if (sortedAnomalies.length > 0) {
      response += '**📊 其他异常**\n';
      for (const anomaly of sortedAnomalies) {
        const icon = anomaly.level === 'critical' ? '🔴' : anomaly.level === 'warning' ? '🟡' : '🟢';
        response += `${icon} ${anomaly.message}\n`;
        if (anomaly.suggestion) {
          response += `   💡 ${anomaly.suggestion}\n`;
        }
        response += '\n';
      }
    }

    return response;
  };

  // 格式化政策回复
  const formatPolicyResponse = (policyData: PolicyData): string => {
    if (!policyData.policies || policyData.policies.length === 0) {
      return '目前还没有配置报销政策。请联系管理员在「设置」中配置公司报销政策。';
    }

    let response = '**公司报销政策**\n\n';

    policyData.policies.forEach((policy, index) => {
      if (!policy.isActive) return;

      response += `**${index + 1}. ${policy.name}**\n`;
      if (policy.description) {
        response += `${policy.description}\n`;
      }
      response += '\n';

      if (policy.rules && policy.rules.length > 0) {
        policy.rules.forEach(rule => {
          const categories = rule.categories?.map(c => categoryLabels[c] || c).join('、') || '所有类别';
          const limitType = rule.limit?.type ? (limitTypeLabels[rule.limit.type] || rule.limit.type) : '';
          const limitAmount = rule.limit ? `${rule.limit.currency === 'USD' ? '$' : '¥'}${rule.limit.amount}` : '';

          response += `• **${rule.name}**\n`;
          response += `  适用：${categories}\n`;
          if (limitAmount) {
            response += `  限额：${limitType}${limitAmount}\n`;
          }
          if (rule.requiresReceipt) {
            response += `  需要发票：是\n`;
          }
          if (rule.requiresApproval) {
            response += `  需要审批：是\n`;
          }
          response += '\n';
        });
      }
    });

    return response;
  };

  // 格式化技术费用分析回复
  const formatTechExpenseResponse = (data: TechExpenseData, type: 'all' | 'ai' | 'saas' = 'all'): string => {
    let response = '';
    const cs = data.summary.currency === 'CNY' ? '¥' : data.summary.currency === 'GBP' ? '£' : data.summary.currency === 'EUR' ? '€' : '$';

    if (type === 'all' || type === 'ai') {
      response += `**📊 本月技术费用分析**\n\n`;

      // 总计与月环比
      response += `**总计：${cs}${data.summary.totalAmount.toLocaleString()}**\n`;

      // 月环比增长
      if (data.summary.lastMonthTotal !== undefined && data.summary.monthOverMonthGrowth !== undefined) {
        const growthIcon = data.summary.monthOverMonthGrowth > 0 ? '📈' : data.summary.monthOverMonthGrowth < 0 ? '📉' : '➡️';
        const growthText = data.summary.monthOverMonthGrowth > 0
          ? `增长 ${data.summary.monthOverMonthGrowth}%`
          : data.summary.monthOverMonthGrowth < 0
          ? `下降 ${Math.abs(data.summary.monthOverMonthGrowth)}%`
          : '持平';
        response += `${growthIcon} 较上月${growthText}（上月：${cs}${data.summary.lastMonthTotal.toLocaleString()}）\n`;

        if (data.comparison) {
          response += `变化：${data.comparison.growth.absolute >= 0 ? '+' : ''}${cs}${data.comparison.growth.absolute.toLocaleString()}\n`;
        }
      }

      response += `涉及 ${data.summary.vendorCount} 个供应商，${data.summary.categoryCount} 个类别\n\n`;

      // 趋势摘要
      if (data.summary.avgMonthlyAmount && data.summary.trendDirection) {
        const trendEmoji = data.summary.trendDirection === 'up' ? '📈' : data.summary.trendDirection === 'down' ? '📉' : '➡️';
        const trendText = data.summary.trendDirection === 'up' ? '上升' : data.summary.trendDirection === 'down' ? '下降' : '稳定';
        response += `**趋势：** ${trendEmoji} 最近趋势${trendText}（月均：${cs}${data.summary.avgMonthlyAmount.toLocaleString()}）\n\n`;
      }

      // 按类别统计（增加月环比）
      response += `**📦 按类别分布：**\n`;
      const categoriesWithData = data.byCategory.filter(c => c.total > 0).sort((a, b) => b.total - a.total);

      categoriesWithData.forEach((cat, index) => {
        response += `${index + 1}. **${cat.label}**：${cs}${cat.total.toLocaleString()} (${cat.percentage}%)`;

        // 添加月环比
        if (cat.growth !== undefined && cat.lastMonthTotal !== undefined) {
          const growthIcon = cat.growth > 5 ? '🔺' : cat.growth < -5 ? '🔻' : '•';
          response += ` ${growthIcon} ${cat.growth > 0 ? '+' : ''}${cat.growth}%`;
        }
        response += `\n`;

        // 显示Top供应商
        if (cat.topVendors && cat.topVendors.length > 0) {
          response += `   主要供应商：${cat.topVendors.map(v => `${v.name}(${cs}${v.amount.toLocaleString()})`).join(', ')}\n`;
        }
      });
      response += '\n';

      // 供应商集中度分析
      if (data.byVendor && data.byVendor.length > 0) {
        response += `**🏢 供应商分析：**\n`;
        const topVendors = data.byVendor.slice(0, 5);
        topVendors.forEach((v, i) => {
          const percentage = data.summary.totalAmount > 0
            ? Math.round((v.totalAmount / data.summary.totalAmount) * 100)
            : 0;
          response += `${i + 1}. ${v.name}（${v.categoryLabel}）：${cs}${v.totalAmount.toLocaleString()} (${percentage}%) - ${v.userCount}位用户\n`;
        });
        response += '\n';
      }

      // 月度趋势
      if (data.monthlyTrend && data.monthlyTrend.length > 1) {
        response += `**📅 月度趋势：**\n`;
        const recentMonths = data.monthlyTrend.slice(-3);
        recentMonths.forEach((m) => {
          response += `• ${m.month}：${cs}${m.amount.toLocaleString()}\n`;
        });
        response += '\n';
      }
    }

    if (type === 'all' || type === 'ai') {
      // AI Token 分析
      if (data.aiTokenAnalysis && data.aiTokenAnalysis.total > 0) {
        response += `**🤖 AI Token 分析**\n`;
        response += `总消耗：${cs}${data.aiTokenAnalysis.total.toLocaleString()}`;

        // AI Token占比
        const aiPercentage = data.summary.totalAmount > 0
          ? Math.round((data.aiTokenAnalysis.total / data.summary.totalAmount) * 100)
          : 0;
        response += ` (占总费用 ${aiPercentage}%)\n\n`;

        if (data.aiTokenAnalysis.topProviders && data.aiTokenAnalysis.topProviders.length > 0) {
          response += `供应商分布：\n`;
          data.aiTokenAnalysis.topProviders.forEach((p, i) => {
            const percentage = Math.round((p.totalAmount / data.aiTokenAnalysis.total) * 100);
            response += `${i + 1}. ${p.name}：${cs}${p.totalAmount.toLocaleString()} (${percentage}%)\n`;
          });

          // 供应商集中度分析
          if (data.aiTokenAnalysis.topProviders.length === 1) {
            response += `\n⚠️ **供应商风险：** 目前仅使用单一AI供应商，存在供应商锁定风险\n`;
          } else if (data.aiTokenAnalysis.topProviders.length > 0) {
            const topProviderPercentage = Math.round((data.aiTokenAnalysis.topProviders[0].totalAmount / data.aiTokenAnalysis.total) * 100);
            if (topProviderPercentage > 70) {
              response += `\n⚠️ **供应商集中度：** ${data.aiTokenAnalysis.topProviders[0].name}占比${topProviderPercentage}%，建议分散供应商风险\n`;
            }
          }
          response += '\n';
        }

        // 优化建议
        if (data.aiTokenAnalysis.suggestions && data.aiTokenAnalysis.suggestions.length > 0) {
          response += `**💡 优化建议：**\n`;
          data.aiTokenAnalysis.suggestions.forEach(s => {
            response += `• ${s}\n`;
          });
          response += '\n';
        }
      }
    }

    if (type === 'all' || type === 'saas') {
      // SaaS 订阅分析
      if (data.saasAnalysis && data.saasAnalysis.total > 0) {
        response += `**☁️ SaaS 订阅分析**\n`;
        response += `总费用：${cs}${data.saasAnalysis.total.toLocaleString()}`;

        // SaaS占比
        const saasPercentage = data.summary.totalAmount > 0
          ? Math.round((data.saasAnalysis.total / data.summary.totalAmount) * 100)
          : 0;
        response += ` (占总费用 ${saasPercentage}%)\n`;
        response += `活跃订阅：${data.saasAnalysis.activeSubscriptions} 个\n\n`;

        if (data.saasAnalysis.topSubscriptions && data.saasAnalysis.topSubscriptions.length > 0) {
          response += `Top 订阅：\n`;
          data.saasAnalysis.topSubscriptions.forEach((s, i) => {
            const percentage = Math.round((s.totalAmount / data.saasAnalysis.total) * 100);
            response += `${i + 1}. ${s.name}：${cs}${s.totalAmount.toLocaleString()} (${percentage}%)\n`;
          });

          // 订阅数量建议
          if (data.saasAnalysis.activeSubscriptions > 10) {
            response += `\n💡 **订阅优化：** 当前订阅数量较多(${data.saasAnalysis.activeSubscriptions}个)，建议审查重复或低使用率工具\n`;
          }
          response += '\n';
        }
      }
    }

    // 用户排行（公司级别）
    if (data.userRanking && data.userRanking.length > 0) {
      response += `**👥 技术费用 Top 5 用户**\n`;
      data.userRanking.slice(0, 5).forEach((u, i) => {
        const userPercentage = data.summary.totalAmount > 0
          ? Math.round((u.total / data.summary.totalAmount) * 100)
          : 0;
        const categoryLabel = u.topCategory ? (categoryLabels[u.topCategory] || u.topCategory) : '未分类';
        response += `${i + 1}. ${u.name}：${cs}${u.total.toLocaleString()} (${userPercentage}%) - 主要：${categoryLabel}\n`;
      });
      response += '\n';
    }

    // 报销时效性分析
    if (data.timelinessAnalysis && data.timelinessAnalysis.totalCount > 0) {
      response += `**⏱️ 报销时效性分析**\n`;
      response += `平均间隔：${data.timelinessAnalysis.averageDays}天 | 中位数：${data.timelinessAnalysis.medianDays}天\n`;
      response += `最长间隔：${data.timelinessAnalysis.maxDays}天 | 最短间隔：${data.timelinessAnalysis.minDays}天\n\n`;

      response += `**时效性分布：**\n`;
      response += `• 7天内提交：${data.timelinessAnalysis.within7Days}笔 (${Math.round((data.timelinessAnalysis.within7Days / data.timelinessAnalysis.totalCount) * 100)}%)\n`;
      response += `• 30天内提交：${data.timelinessAnalysis.within30Days}笔 (${data.timelinessAnalysis.complianceRate}%)\n`;

      if (data.timelinessAnalysis.over30Days > 0) {
        response += `• ⚠️ 超过30天：${data.timelinessAnalysis.over30Days}笔`;
        if (data.timelinessAnalysis.over60Days > 0) {
          response += ` (其中超60天: ${data.timelinessAnalysis.over60Days}笔`;
          if (data.timelinessAnalysis.over90Days > 0) {
            response += `, 超90天: ${data.timelinessAnalysis.over90Days}笔`;
          }
          response += ')';
        }
        response += '\n';
      }

      // 时效性建议
      if (data.timelinessAnalysis.complianceRate < 80) {
        response += `\n💡 **时效性建议：** 当前30天内提交率${data.timelinessAnalysis.complianceRate}%，建议提醒员工及时提交报销，避免跨期费用\n`;
      } else if (data.timelinessAnalysis.complianceRate >= 95) {
        response += `\n✅ **时效性评价：** 报销提交及时性良好（${data.timelinessAnalysis.complianceRate}%在30天内）\n`;
      }
      response += '\n';
    }

    if (!response) {
      response = '本月暂无技术费用记录。';
    }

    return response;
  };

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
      let response: Message;
      const lowerText = messageText.toLowerCase();

      // 预算预警检查
      if (lowerText.includes('预算') || lowerText.includes('预警') || lowerText.includes('超支')) {
        const result = await executeSkill('builtin_budget_alert');
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: formatBudgetAlertResponse(result),
          timestamp: new Date(),
        };
      }
      // 异常消费检测
      else if (lowerText.includes('异常') || lowerText.includes('检测') || lowerText.includes('风险')) {
        const result = await executeSkill('builtin_anomaly_detector');
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: formatAnomalyResponse(result),
          timestamp: new Date(),
        };
      }
      // 政策查询
      else if (lowerText.includes('政策') || lowerText.includes('规定') || lowerText.includes('限额') || lowerText.includes('标准')) {
        const policyData = await fetchPolicies();
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: policyData ? formatPolicyResponse(policyData) : '获取政策信息失败，请稍后重试。',
          timestamp: new Date(),
          data: policyData,
          dataType: 'policy',
        };
      }
      // AI 消耗分析
      else if (lowerText.includes('ai') || lowerText.includes('token') || lowerText.includes('openai') || lowerText.includes('claude')) {
        // 检查是否有月份指定
        const monthsInfo = parseMonthsFromQuery(messageText);

        if (monthsInfo && monthsInfo.months.length >= 2) {
          // 多月AI对比
          const monthsData: { month: string; data: TechExpenseData }[] = [];
          const currentYear = new Date().getFullYear();

          for (const month of monthsInfo.months) {
            const monthNum = parseInt(month);
            const year = (monthNum === 12 && monthsInfo.months.some(m => parseInt(m) <= 2)) ? currentYear - 1 : currentYear;

            const startDate = new Date(year, monthNum - 1, 1);
            const endDate = new Date(year, monthNum, 0);

            const data = await fetchTechExpenses(
              'company',
              'expense_date', // 使用费用发生日期
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0]
            );

            if (data) {
              monthsData.push({ month: `${year}年${month}月`, data });
            }
          }

          if (monthsData.length > 0) {
            response = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: formatMultiMonthComparison(monthsData),
              timestamp: new Date(),
            };
          } else {
            response = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: '未找到指定月份的AI费用数据。',
              timestamp: new Date(),
            };
          }
        } else {
          // 默认当前月份或指定单月
          const techData = await fetchTechExpenses('company');
          response = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: techData ? formatTechExpenseResponse(techData, 'ai') : '获取 AI 消耗数据失败，请稍后重试。',
            timestamp: new Date(),
            data: techData,
            dataType: 'tech_expense',
          };
        }
      }
      // SaaS 分析
      else if (lowerText.includes('saas') || lowerText.includes('订阅') || lowerText.includes('软件')) {
        const techData = await fetchTechExpenses('company');
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: techData ? formatTechExpenseResponse(techData, 'saas') : '获取 SaaS 订阅数据失败，请稍后重试。',
          timestamp: new Date(),
          data: techData,
          dataType: 'tech_expense',
        };
      }
      // 技术费用/费用分析
      else if (lowerText.includes('技术') || lowerText.includes('费用') || lowerText.includes('分析') || lowerText.includes('统计') || lowerText.includes('云') || lowerText.includes('消耗')) {
        // 检查是否有月份指定
        const monthsInfo = parseMonthsFromQuery(messageText);

        if (monthsInfo && monthsInfo.months.length >= 2) {
          // 多月对比
          const monthsData: { month: string; data: TechExpenseData }[] = [];
          const currentYear = new Date().getFullYear();

          for (const month of monthsInfo.months) {
            const monthNum = parseInt(month);
            // 判断年份：12月使用去年，1-2月使用今年
            const year = (monthNum === 12 && monthsInfo.months.some(m => parseInt(m) <= 2)) ? currentYear - 1 : currentYear;

            const startDate = new Date(year, monthNum - 1, 1);
            const endDate = new Date(year, monthNum, 0); // 月份最后一天

            const data = await fetchTechExpenses(
              'company',
              'expense_date', // 使用费用发生日期
              startDate.toISOString().split('T')[0],
              endDate.toISOString().split('T')[0]
            );

            if (data) {
              monthsData.push({
                month: `${year}年${month}月`,
                data,
              });
            }
          }

          if (monthsData.length > 0) {
            response = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: formatMultiMonthComparison(monthsData),
              timestamp: new Date(),
            };
          } else {
            response = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: '未找到指定月份的数据，请确认时间范围。',
              timestamp: new Date(),
            };
          }
        } else if (monthsInfo && monthsInfo.months.length === 1) {
          // 单个月份指定
          const monthNum = parseInt(monthsInfo.months[0]);
          const year = monthsInfo.year;

          const startDate = new Date(year, monthNum - 1, 1);
          const endDate = new Date(year, monthNum, 0);

          const techData = await fetchTechExpenses(
            'company',
            'expense_date', // 使用费用发生日期
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
          );

          response = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: techData
              ? `**📊 ${year}年${monthsInfo.months[0]}月技术费用分析**\n\n` + formatTechExpenseResponse(techData, 'all')
              : `获取${year}年${monthsInfo.months[0]}月数据失败，请稍后重试。`,
            timestamp: new Date(),
            data: techData,
            dataType: 'tech_expense',
          };
        } else {
          // 默认当前月份
          const techData = await fetchTechExpenses('company');
          response = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: techData ? formatTechExpenseResponse(techData, 'all') : '获取技术费用数据失败，请稍后重试。',
            timestamp: new Date(),
            data: techData,
            dataType: 'tech_expense',
          };
        }
      }
      // 我的费用
      else if (lowerText.includes('我的') || lowerText.includes('个人')) {
        const techData = await fetchTechExpenses('personal');
        let content = techData ? formatTechExpenseResponse(techData, 'all') : '获取个人费用数据失败，请稍后重试。';
        content = content.replace('本月技术费用分析', '我的本月技术费用');
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
          timestamp: new Date(),
          data: techData,
          dataType: 'tech_expense',
        };
      }
      // 优化建议
      else if (lowerText.includes('优化') || lowerText.includes('建议') || lowerText.includes('节省') || lowerText.includes('省钱')) {
        const techData = await fetchTechExpenses('company');
        let content = '**💡 成本优化建议**\n\n';

        if (techData) {
          // AI 优化建议
          if (techData.aiTokenAnalysis?.suggestions?.length > 0) {
            content += '**AI 服务优化：**\n';
            techData.aiTokenAnalysis.suggestions.forEach(s => {
              content += `• ${s}\n`;
            });
            content += '\n';
          }

          // SaaS 优化建议
          if (techData.saasAnalysis?.activeSubscriptions > 5) {
            content += '**SaaS 订阅优化：**\n';
            content += `• 当前有 ${techData.saasAnalysis.activeSubscriptions} 个活跃订阅，建议定期审查是否有重复或低使用率的工具\n`;
            content += '• 考虑将月付订阅转为年付以获得折扣\n\n';
          }

          // 通用建议
          content += '**通用建议：**\n';
          content += '• 集中采购：多人使用的工具考虑团队版\n';
          content += '• 定期审查：每季度审查订阅使用情况\n';
          content += '• 成本分配：按项目或部门分配费用便于追踪\n';
        } else {
          content += '暂无足够数据生成优化建议，请确保有历史报销记录。';
        }

        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
          timestamp: new Date(),
          data: techData,
          dataType: 'tech_expense',
        };
      }
      // 默认回复
      else {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '我可以帮你：\n\n• **查询政策** - 说"报销政策是什么"\n• **技术费用分析** - 说"分析本月技术费用"\n• **预算预警** - 说"预算预警检查"\n• **异常检测** - 说"异常消费检测"\n• **优化建议** - 说"给我一些优化建议"\n\n请告诉我你想了解什么？',
          timestamp: new Date(),
        };
      }

      setMessages(prev => [...prev, response]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isFirstMessage = messages.length === 1;

  return (
    <div style={{
      height: 'calc(100vh - 10rem)',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>AI 助手</h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>政策查询 · 费用分析 · 优化建议</p>
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        paddingBottom: '1rem',
        paddingRight: '0.5rem'
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '1rem'
            }}
          >
            {message.role === 'assistant' && (
              <div style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '0.75rem',
                flexShrink: 0
              }}>
                <span style={{ color: 'white', fontSize: '0.875rem' }}>🤖</span>
              </div>
            )}
            <div
              style={{
                maxWidth: '75%',
                borderRadius: '1rem',
                padding: '1rem',
                backgroundColor: message.role === 'user' ? '#2563eb' : 'white',
                color: message.role === 'user' ? 'white' : '#111827',
                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                boxShadow: message.role === 'assistant' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</div>
              {message.actions && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  {message.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={action.onClick}
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {message.role === 'user' && (
              <div style={{
                width: '32px',
                height: '32px',
                backgroundColor: '#2563eb',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '0.75rem',
                flexShrink: 0
              }}>
                <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 500 }}>F</span>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '0.75rem'
            }}>
              <span style={{ color: 'white', fontSize: '0.875rem' }}>🤖</span>
            </div>
            <div style={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '1rem',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                正在分析数据...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Capabilities Grid - Show only on first message */}
      {isFirstMessage && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem'
          }}>
            {capabilities.map((cap, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{cap.icon}</div>
                <p style={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  {cap.title}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample Prompts - Show only on first message */}
      {isFirstMessage && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {samplePrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => sendMessage(prompt.text)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <span>{prompt.icon}</span> {prompt.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        border: '1px solid #e5e7eb',
        padding: '0.75rem',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="输入问题，如：报销政策是什么、分析AI消耗..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: 'none',
              outline: 'none',
              fontSize: '1rem',
              backgroundColor: 'transparent'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '0.625rem 1.25rem',
              background: !input.trim() || isLoading
                ? '#9ca3af'
                : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem'
            }}
          >
            发送
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
