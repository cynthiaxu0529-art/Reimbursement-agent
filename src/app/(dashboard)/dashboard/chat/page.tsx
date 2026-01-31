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
  summary: {
    totalAmount: number;
    currency: string;
    categoryCount: number;
    vendorCount: number;
  };
  byCategory: {
    category: string;
    label: string;
    total: number;
    count: number;
    percentage: number;
    topVendors: { name: string; amount: number }[];
  }[];
  byVendor: {
    name: string;
    categoryLabel: string;
    totalAmount: number;
    count: number;
    userCount: number;
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

  // 获取技术费用分析
  const fetchTechExpenses = async (scope: string = 'company'): Promise<TechExpenseData | null> => {
    try {
      const response = await fetch(`/api/analytics/tech-expenses?period=month&scope=${scope}`);
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
        response += `• 本月技术费用总计：¥${data.summary.totalTechExpense?.toLocaleString() || 0}\n`;
        if (data.summary.totalLimit) {
          response += `• 预算限额：¥${data.summary.totalLimit.toLocaleString()}\n`;
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
        response += `• 本月总额：¥${data.summary.totalAmount?.toLocaleString() || 0}\n`;
        if (data.summary.lastMonthTotal) {
          response += `• 上月总额：¥${data.summary.lastMonthTotal.toLocaleString()}\n`;
        }
      }
      return response;
    }

    response += `检测到 **${data.anomalyCount}** 个异常`;
    if (data.criticalCount > 0) {
      response += `（其中 ${data.criticalCount} 个需要立即关注）`;
    }
    response += '\n\n';

    // 按级别排序显示异常
    const sortedAnomalies = [...(data.anomalies || [])].sort((a: any, b: any) => {
      const levelOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      return (levelOrder[a.level] || 2) - (levelOrder[b.level] || 2);
    });

    for (const anomaly of sortedAnomalies) {
      const icon = anomaly.level === 'critical' ? '🔴' : anomaly.level === 'warning' ? '🟡' : '🟢';
      response += `${icon} ${anomaly.message}\n`;
      if (anomaly.suggestion) {
        response += `   💡 ${anomaly.suggestion}\n`;
      }
      response += '\n';
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

    if (type === 'all' || type === 'ai') {
      response += `**📊 本月技术费用分析**\n\n`;
      response += `**总计：¥${data.summary.totalAmount.toLocaleString()}**\n`;
      response += `涉及 ${data.summary.vendorCount} 个供应商，${data.summary.categoryCount} 个类别\n\n`;

      // 按类别统计
      response += `**按类别分布：**\n`;
      data.byCategory
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .forEach(cat => {
          response += `• ${cat.label}：¥${cat.total.toLocaleString()} (${cat.percentage}%)\n`;
        });
      response += '\n';
    }

    if (type === 'all' || type === 'ai') {
      // AI Token 分析
      if (data.aiTokenAnalysis && data.aiTokenAnalysis.total > 0) {
        response += `**🤖 AI Token 分析**\n`;
        response += `总消耗：¥${data.aiTokenAnalysis.total.toLocaleString()}\n\n`;

        if (data.aiTokenAnalysis.topProviders && data.aiTokenAnalysis.topProviders.length > 0) {
          response += `供应商分布：\n`;
          data.aiTokenAnalysis.topProviders.forEach((p, i) => {
            const percentage = Math.round((p.totalAmount / data.aiTokenAnalysis.total) * 100);
            response += `${i + 1}. ${p.name}：¥${p.totalAmount.toLocaleString()} (${percentage}%)\n`;
          });
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
        response += `总费用：¥${data.saasAnalysis.total.toLocaleString()}\n`;
        response += `活跃订阅：${data.saasAnalysis.activeSubscriptions} 个\n\n`;

        if (data.saasAnalysis.topSubscriptions && data.saasAnalysis.topSubscriptions.length > 0) {
          response += `Top 订阅：\n`;
          data.saasAnalysis.topSubscriptions.forEach((s, i) => {
            response += `${i + 1}. ${s.name}：¥${s.totalAmount.toLocaleString()}\n`;
          });
          response += '\n';
        }
      }
    }

    // 用户排行（公司级别）
    if (data.userRanking && data.userRanking.length > 0) {
      response += `**👥 技术费用 Top 5 用户**\n`;
      data.userRanking.slice(0, 5).forEach((u, i) => {
        response += `${i + 1}. ${u.name}：¥${u.total.toLocaleString()}\n`;
      });
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
