'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  amountInBaseCurrency?: number;
  date: string;
  receiptUrl?: string;
  vendor?: string;
  // 票据验证信息
  isOfficialInvoice?: boolean;
  documentCountry?: string;
  invoiceValidation?: {
    hasInvoiceCode: boolean;
    hasCheckCode: boolean;
    hasTaxNumber: boolean;
    hasQRCode: boolean;
    suggestedAction?: string;
  };
}

// Risk alert interface
interface RiskAlert {
  id: string;
  type: 'over_budget' | 'anomaly' | 'missing_attachment' | 'policy_violation';
  level: 'high' | 'medium' | 'low';
  itemId?: string;
  message: string;
  standardValue?: number;
  actualValue?: number;
  percentage?: number;
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
  baseCurrency?: string;
  createdAt: string;
  submittedAt?: string;
  items: ReimbursementItem[];
  submitter?: {
    name: string;
    email: string;
  };
  riskAlerts?: RiskAlert[];
}

const categoryLabels: Record<string, { label: string; icon: string }> = {
  flight: { label: '机票', icon: '✈️' },
  train: { label: '火车票', icon: '🚄' },
  hotel: { label: '酒店住宿', icon: '🏨' },
  meal: { label: '餐饮', icon: '🍽️' },
  taxi: { label: '交通', icon: '🚕' },
  office_supplies: { label: '办公用品', icon: '📎' },
  ai_token: { label: 'AI 服务', icon: '🤖' },
  cloud_resource: { label: '云资源', icon: '☁️' },
  client_entertainment: { label: '客户招待', icon: '🤝' },
  other: { label: '其他', icon: '📦' },
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: '待审批', variant: 'warning' },
  under_review: { label: '审核中', variant: 'info' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'danger' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  KRW: '₩',
};

// Risk level config
const riskLevelConfig: Record<string, { icon: string; label: string; bgClass: string; textClass: string; borderClass: string }> = {
  high: { icon: '🔴', label: '超标', bgClass: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-500' },
  medium: { icon: '🟡', label: '异常', bgClass: 'bg-amber-50', textClass: 'text-amber-700', borderClass: 'border-amber-500' },
  low: { icon: '🟠', label: '提醒', bgClass: 'bg-orange-50', textClass: 'text-orange-700', borderClass: 'border-orange-500' },
};

// Generate reimbursement number
const generateReimbursementNumber = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const idSuffix = id.slice(-4).toUpperCase();
  return `BX${year}${month}${day}-${idSuffix}`;
};

// Policy rule interface
interface PolicyRule {
  id: string;
  name: string;
  categories?: string[];
  limit?: {
    type: 'per_item' | 'per_day' | 'per_month';
    amount: number;
    currency: string;
  };
  condition?: {
    type: string;
    operator: string;
    value: string[];
  };
  message?: string;
}

interface Policy {
  id: string;
  name: string;
  isActive: boolean;
  rules: PolicyRule[];
}

// Exchange rate for USD to CNY (simplified)
const USD_TO_CNY = 7.2;

// Risk analysis based on policies
const analyzeRisksWithPolicies = (item: Reimbursement, policies: Policy[]): RiskAlert[] => {
  const alerts: RiskAlert[] = [];
  const activePolicies = policies.filter(p => p.isActive);

  // Group items by date for daily limit checking
  const itemsByDate: Record<string, ReimbursementItem[]> = {};
  item.items?.forEach(expense => {
    const dateKey = expense.date?.split('T')[0] || 'unknown';
    if (!itemsByDate[dateKey]) {
      itemsByDate[dateKey] = [];
    }
    itemsByDate[dateKey].push(expense);
  });

  // Check each policy
  for (const policy of activePolicies) {
    for (const rule of policy.rules) {
      if (!rule.limit) continue;

      const ruleCategories = rule.categories || [];
      const limitAmountUSD = rule.limit.amount;
      const limitType = rule.limit.type;

      // Check daily limits
      if (limitType === 'per_day') {
        for (const [date, dateItems] of Object.entries(itemsByDate)) {
          // Filter items matching this rule's categories
          const matchingItems = dateItems.filter(exp =>
            ruleCategories.includes(exp.category)
          );

          if (matchingItems.length === 0) continue;

          // Calculate total for the day in USD
          const dailyTotalUSD = matchingItems.reduce((sum, exp) => {
            const amountUSD = exp.currency === 'USD'
              ? exp.amount
              : (exp.amountInBaseCurrency || exp.amount) / USD_TO_CNY;
            return sum + amountUSD;
          }, 0);

          if (dailyTotalUSD > limitAmountUSD) {
            const overAmount = dailyTotalUSD - limitAmountUSD;
            const percentage = Math.round((overAmount / limitAmountUSD) * 100);

            alerts.push({
              id: `risk-${date}-${ruleCategories.join('-')}`,
              type: 'over_budget',
              level: percentage > 50 ? 'high' : 'medium',
              message: `${date} ${ruleCategories.map(c => categoryLabels[c]?.label || c).join('+')} 费用 $${dailyTotalUSD.toFixed(0)} 超出每日限额 $${limitAmountUSD}`,
              standardValue: limitAmountUSD,
              actualValue: dailyTotalUSD,
              percentage,
            });
          }
        }
      }

      // Check monthly limits
      if (limitType === 'per_month') {
        const matchingItems = item.items?.filter(exp =>
          ruleCategories.includes(exp.category)
        ) || [];

        if (matchingItems.length === 0) continue;

        // Calculate total in USD
        const monthlyTotalUSD = matchingItems.reduce((sum, exp) => {
          const amountUSD = exp.currency === 'USD'
            ? exp.amount
            : (exp.amountInBaseCurrency || exp.amount) / USD_TO_CNY;
          return sum + amountUSD;
        }, 0);

        if (monthlyTotalUSD > limitAmountUSD) {
          const overAmount = monthlyTotalUSD - limitAmountUSD;
          const percentage = Math.round((overAmount / limitAmountUSD) * 100);

          alerts.push({
            id: `risk-monthly-${ruleCategories.join('-')}`,
            type: 'over_budget',
            level: 'high',
            message: `${ruleCategories.map(c => categoryLabels[c]?.label || c).join('/')} 费用 $${monthlyTotalUSD.toFixed(0)} 超出每月限额 $${limitAmountUSD}`,
            standardValue: limitAmountUSD,
            actualValue: monthlyTotalUSD,
            percentage,
          });
        }
      }
    }
  }

  // Check for missing or invalid attachments
  item.items?.forEach((expense) => {
    const catLabel = categoryLabels[expense.category]?.label || expense.category;

    // No receipt at all
    if (!expense.receiptUrl && expense.amount > 100) {
      alerts.push({
        id: `risk-${expense.id}-attachment`,
        type: 'missing_attachment',
        level: 'low',
        itemId: expense.id,
        message: `${catLabel}费用缺少发票附件`,
      });
      return; // Skip other checks if no receipt
    }

    // Has receipt but need to check if it's official invoice
    if (expense.receiptUrl) {
      // If we have validation info from OCR
      if (expense.isOfficialInvoice === false) {
        const action = expense.invoiceValidation?.suggestedAction || '需补充正式发票';
        alerts.push({
          id: `risk-${expense.id}-unofficial`,
          type: 'missing_attachment',
          level: 'medium',
          itemId: expense.id,
          message: `${catLabel}：${action}`,
        });
      }
      // Special check for hotel in China - always verify if official
      else if (expense.category === 'hotel' && expense.amount > 500 && expense.documentCountry === 'CN') {
        if (expense.isOfficialInvoice !== true) {
          alerts.push({
            id: `risk-${expense.id}-invoice-check`,
            type: 'missing_attachment',
            level: 'low',
            itemId: expense.id,
            message: `酒店住宿请确认是否有正规增值税发票（非水单）`,
          });
        }
      }
    }
  });

  return alerts;
};

// Fallback function when policies not loaded
const analyzeRisks = (item: Reimbursement): RiskAlert[] => {
  return analyzeRisksWithPolicies(item, []);
};

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingApprovals, setPendingApprovals] = useState<Reimbursement[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Reimbursement | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);

  // Reminder modal state
  const [reminderModal, setReminderModal] = useState<{
    open: boolean;
    reimbursementId: string;
    submitterEmail?: string;
    submitterName?: string;
    alerts: RiskAlert[];
  } | null>(null);
  const [reminderMethod, setReminderMethod] = useState<'email' | 'slack' | 'both'>('email');
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [reminderNote, setReminderNote] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);

  // Fetch policies and approvals
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch policies first
        let loadedPolicies: Policy[] = [];
        try {
          const policiesResponse = await fetch('/api/settings/policies');
          const policiesResult = await policiesResponse.json();
          if (policiesResult.success) {
            loadedPolicies = policiesResult.data || [];
            setPolicies(loadedPolicies);
          }
        } catch (e) {
          console.error('Failed to fetch policies:', e);
        }

        // Fetch pending approvals
        const pendingResponse = await fetch('/api/reimbursements?status=pending&role=approver');
        const pendingResult = await pendingResponse.json();
        if (pendingResult.success) {
          // Add risk analysis to each item using real policies
          const dataWithRisks = (pendingResult.data || []).map((item: Reimbursement) => ({
            ...item,
            riskAlerts: analyzeRisksWithPolicies(item, loadedPolicies),
          }));
          setPendingApprovals(dataWithRisks);
        }

        // Fetch approval history
        const historyResponse = await fetch('/api/reimbursements?status=approved,rejected&role=approver');
        const historyResult = await historyResponse.json();
        if (historyResult.success) {
          setApprovalHistory(historyResult.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch expanded detail
  useEffect(() => {
    if (!expandedId) {
      setExpandedData(null);
      return;
    }

    const currentList = activeTab === 'pending' ? pendingApprovals : approvalHistory;
    const listItem = currentList.find(r => r.id === expandedId);
    if (listItem) {
      setExpandedData(listItem);
    }

    const fetchDetail = async () => {
      setExpandLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${expandedId}`);
        const result = await response.json();
        if (result.success && result.data) {
          const dataWithRisks = {
            ...result.data,
            riskAlerts: analyzeRisksWithPolicies(result.data, policies),
          };
          setExpandedData(dataWithRisks);
        }
      } catch (error) {
        console.error('Failed to fetch detail:', error);
      } finally {
        setExpandLoading(false);
      }
    };

    fetchDetail();
  }, [expandedId, pendingApprovals, approvalHistory, activeTab, policies]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', comment }),
      });
      const result = await response.json();
      if (result.success) {
        const approved = pendingApprovals.find(a => a.id === id);
        if (approved) {
          approved.status = 'approved';
          setApprovalHistory([approved, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
        setExpandedId(null);
        setComment('');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    if (!reason) {
      alert('请输入拒绝原因');
      return;
    }
    setProcessing(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectReason: reason }),
      });
      const result = await response.json();
      if (result.success) {
        const rejected = pendingApprovals.find(a => a.id === id);
        if (rejected) {
          rejected.status = 'rejected';
          setApprovalHistory([rejected, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
        setExpandedId(null);
        setComment('');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const openReminderModal = (item: Reimbursement) => {
    setReminderModal({
      open: true,
      reimbursementId: item.id,
      submitterEmail: item.submitter?.email,
      submitterName: item.submitter?.name,
      alerts: item.riskAlerts || [],
    });
    setSelectedAlerts(item.riskAlerts?.filter(a => a.type === 'missing_attachment').map(a => a.id) || []);
    setReminderNote('');
  };

  const sendReminder = async () => {
    if (!reminderModal || selectedAlerts.length === 0) return;

    setSendingReminder(true);
    // Mock sending - in production this would call an API
    await new Promise(resolve => setTimeout(resolve, 1000));

    alert(`已通过${reminderMethod === 'both' ? '邮件和Slack' : reminderMethod === 'email' ? '邮件' : 'Slack'}发送补充提醒`);
    setSendingReminder(false);
    setReminderModal(null);
  };

  // Calculate stats
  const stats = {
    pending: pendingApprovals.length,
    underReview: pendingApprovals.filter(a => a.status === 'under_review').length,
    approved: approvalHistory.filter(a => a.status === 'approved').length,
    rejected: approvalHistory.filter(a => a.status === 'rejected').length,
    withRisks: pendingApprovals.filter(a => (a.riskAlerts?.length || 0) > 0).length,
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const currentList = activeTab === 'pending' ? pendingApprovals : approvalHistory;

  // Get risk count for item
  const getRiskCount = (item: Reimbursement) => item.riskAlerts?.length || 0;
  const getHighestRiskLevel = (item: Reimbursement): 'high' | 'medium' | 'low' | 'none' => {
    if (!item.riskAlerts || item.riskAlerts.length === 0) return 'none';
    if (item.riskAlerts.some(r => r.level === 'high')) return 'high';
    if (item.riskAlerts.some(r => r.level === 'medium')) return 'medium';
    return 'low';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">报销审批</h1>
        <p className="text-sm text-gray-500">审核和处理待审批的报销申请</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <button
          onClick={() => setActiveTab('pending')}
          className={`rounded-xl p-4 text-left transition-all ${
            activeTab === 'pending'
              ? 'bg-amber-50 border-2 border-amber-600'
              : 'bg-white border border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className="text-[13px] text-gray-500 mb-1">待审批</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          {stats.withRisks > 0 && (
            <p className="text-xs text-red-600 mt-1">⚠️ {stats.withRisks}项异常</p>
          )}
        </button>

        <Card className="p-4">
          <p className="text-[13px] text-gray-500 mb-1">审核中</p>
          <p className="text-2xl font-bold text-blue-600">{stats.underReview}</p>
        </Card>

        <button
          onClick={() => setActiveTab('history')}
          className={`rounded-xl p-4 text-left transition-all ${
            activeTab === 'history'
              ? 'bg-green-50 border-2 border-green-600'
              : 'bg-white border border-gray-200 hover:border-gray-300'
          }`}
        >
          <p className="text-[13px] text-gray-500 mb-1">已审批</p>
          <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
        </button>

        <Card className="p-4">
          <p className="text-[13px] text-gray-500 mb-1">已拒绝</p>
          <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
        </Card>
      </div>

      {/* Table */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[150px_100px_1.2fr_90px_90px_120px_120px_60px] gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase items-center">
          <div>报销编号</div>
          <div>申请人</div>
          <div>报销说明</div>
          <div>提交日期</div>
          <div>状态</div>
          <div className="text-right">原币金额</div>
          <div className="text-right">报销金额</div>
          <div className="text-center">风险</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-10 text-center text-gray-500">加载中...</div>
          )}

          {!loading && currentList.length === 0 && (
            <div className="py-16 px-5 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                {activeTab === 'pending' ? '✅' : '📋'}
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                {activeTab === 'pending' ? '没有待审批的报销' : '暂无审批记录'}
              </h3>
              <p className="text-sm text-gray-500">
                {activeTab === 'pending'
                  ? '当团队成员提交报销申请后，将会在这里显示'
                  : '审批过的报销申请将会显示在这里'}
              </p>
            </div>
          )}

          {!loading && currentList.map((item) => {
            const isExpanded = expandedId === item.id;
            const reimbursementNo = generateReimbursementNumber(item.createdAt, item.id);
            const riskCount = getRiskCount(item);
            const riskLevel = getHighestRiskLevel(item);
            const statusInfo = statusConfig[item.status] || statusConfig.pending;

            // Calculate original currency
            const firstItem = item.items?.[0];
            const originalCurrency = firstItem?.currency || 'CNY';
            const originalAmount = item.items?.reduce((sum, i) => sum + i.amount, 0) || item.totalAmount;
            const currencySymbol = currencySymbols[originalCurrency] || originalCurrency;
            const hasMultipleCurrencies = item.items?.some(i => i.currency !== originalCurrency);

            return (
              <div key={item.id}>
                {/* Main Row */}
                <div
                  className={`grid grid-cols-[150px_100px_1.2fr_90px_90px_120px_120px_60px] gap-2 px-4 py-3.5 items-center transition-colors ${
                    isExpanded ? 'bg-purple-50' : 'hover:bg-gray-50'
                  } ${!isExpanded ? 'border-b' : ''}`}
                >
                  {/* Reimbursement Number - Clickable */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="text-[13px] font-medium text-violet-600 font-mono flex items-center gap-1.5 text-left hover:text-violet-800"
                  >
                    <span className={`text-[10px] text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    {reimbursementNo}
                  </button>

                  {/* Submitter */}
                  <div className="text-[13px] text-gray-700">
                    {item.submitter?.name || '用户'}
                  </div>

                  {/* Description */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500">{item.items?.length || 0} 项费用</p>
                  </div>

                  {/* Submit Date */}
                  <div className="text-[13px] text-gray-500">
                    {formatDate(item.submittedAt || item.createdAt)}
                  </div>

                  {/* Status */}
                  <div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>

                  {/* Original Amount */}
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-gray-900">
                      {currencySymbol}{originalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {hasMultipleCurrencies ? '多币种' : originalCurrency}
                    </p>
                  </div>

                  {/* Reimbursement Amount (USD) */}
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-green-600">
                      ${(item.totalAmountInBaseCurrency || item.totalAmount * 0.14).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Risk Indicator */}
                  <div className="text-center">
                    {riskLevel === 'none' ? (
                      <span className="text-green-600 text-sm">✓</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-xl text-xs font-medium ${riskLevelConfig[riskLevel].bgClass} ${riskLevelConfig[riskLevel].textClass}`}>
                        ⚠️ {riskCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="bg-purple-50 border-b p-4">
                    {expandLoading && !expandedData && (
                      <div className="text-center text-gray-500 py-5">加载中...</div>
                    )}

                    {expandedData && expandedData.id === item.id && (
                      <div>
                        {/* Risk Alerts Section */}
                        {expandedData.riskAlerts && expandedData.riskAlerts.length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                            <div className="flex items-center justify-between mb-2.5">
                              <h4 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                                ⚠️ 风险提示
                              </h4>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openReminderModal(expandedData)}
                                className="text-violet-600 border-violet-600 hover:bg-violet-50"
                              >
                                📧 发送补充提醒
                              </Button>
                            </div>
                            <div className="flex flex-col gap-2">
                              {expandedData.riskAlerts.map((alert) => (
                                <div
                                  key={alert.id}
                                  className={`flex items-center gap-2 p-2 bg-white rounded-md border-l-[3px] ${riskLevelConfig[alert.level].borderClass}`}
                                >
                                  <span>{riskLevelConfig[alert.level].icon}</span>
                                  <span className="text-[13px] text-gray-700">
                                    <strong className={riskLevelConfig[alert.level].textClass}>
                                      {riskLevelConfig[alert.level].label}:
                                    </strong>{' '}
                                    {alert.message}
                                    {alert.percentage && (
                                      <span className="text-red-600 font-medium"> (超出{alert.percentage}%)</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Line Items Table */}
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">
                            费用明细 ({expandedData.items?.length || 0} 项)
                          </h4>

                          {expandedData.items && expandedData.items.length > 0 ? (
                            <div className="bg-white border rounded-lg overflow-hidden">
                              {/* Items Header */}
                              <div className="grid grid-cols-[2fr_1fr_120px_100px_120px_40px] gap-3 px-3.5 py-2.5 bg-gray-50 border-b text-[11px] font-semibold text-gray-500 uppercase">
                                <div>费用项目</div>
                                <div>类别</div>
                                <div className="text-right">原币金额</div>
                                <div className="text-center">汇率</div>
                                <div className="text-right">美元金额</div>
                                <div></div>
                              </div>

                              {/* Items Rows */}
                              {expandedData.items.map((lineItem, idx) => {
                                const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                                const itemCurrency = lineItem.currency || 'CNY';
                                const itemSymbol = currencySymbols[itemCurrency] || itemCurrency;
                                const exchangeRate = itemCurrency === 'CNY' ? 1 : (lineItem.amountInBaseCurrency && lineItem.amount > 0 ? lineItem.amountInBaseCurrency / lineItem.amount : 0.14);
                                const convertedAmount = lineItem.amountInBaseCurrency || lineItem.amount * exchangeRate;
                                const itemRisks = expandedData.riskAlerts?.filter(r => r.itemId === lineItem.id) || [];
                                const hasRisk = itemRisks.length > 0;
                                const itemRiskLevel = itemRisks.find(r => r.level === 'high') ? 'high' : itemRisks.find(r => r.level === 'medium') ? 'medium' : 'low';

                                return (
                                  <div
                                    key={lineItem.id}
                                    className={`grid grid-cols-[2fr_1fr_120px_100px_120px_40px] gap-3 px-3.5 py-3 items-center ${
                                      idx < (expandedData.items?.length || 0) - 1 ? 'border-b border-gray-100' : ''
                                    } ${hasRisk ? 'bg-amber-50' : ''}`}
                                  >
                                    {/* Item Description */}
                                    <div>
                                      <p className="text-[13px] font-medium text-gray-900">
                                        {lineItem.description || catInfo.label}
                                      </p>
                                      {lineItem.vendor && (
                                        <p className="text-[11px] text-gray-500">{lineItem.vendor}</p>
                                      )}
                                      {lineItem.receiptUrl && (
                                        <button
                                          onClick={() => setPreviewImage(lineItem.receiptUrl || null)}
                                          className="text-[11px] text-blue-600 mt-0.5 hover:underline"
                                        >
                                          📎 查看凭证
                                        </button>
                                      )}
                                    </div>

                                    {/* Category */}
                                    <div>
                                      <span className="text-xs text-gray-700 px-2 py-1 bg-gray-100 rounded">
                                        {catInfo.icon} {catInfo.label}
                                      </span>
                                    </div>

                                    {/* Original Amount */}
                                    <div className="text-right">
                                      <p className="text-[13px] font-semibold text-gray-900">
                                        {itemSymbol}{lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                      </p>
                                      <p className="text-[10px] text-gray-500">{itemCurrency}</p>
                                    </div>

                                    {/* Exchange Rate */}
                                    <div className="text-center text-xs text-gray-500">
                                      {exchangeRate.toFixed(4)}
                                    </div>

                                    {/* Converted Amount (USD) */}
                                    <div className="text-right">
                                      <p className="text-[13px] font-semibold text-green-600">
                                        ${(lineItem.amountInBaseCurrency || lineItem.amount * 0.14).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>

                                    {/* Risk indicator */}
                                    <div className="text-center">
                                      {hasRisk ? (
                                        <span className={riskLevelConfig[itemRiskLevel].textClass}>
                                          {riskLevelConfig[itemRiskLevel].icon}
                                        </span>
                                      ) : (
                                        <span className="text-green-600">✓</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Total Row */}
                              <div className="grid grid-cols-[2fr_1fr_120px_100px_120px_40px] gap-3 px-3.5 py-3 bg-gray-50 border-t items-center">
                                <div className="text-[13px] font-semibold text-gray-700">合计</div>
                                <div></div>
                                <div className="text-right">
                                  <p className="text-[13px] font-semibold text-gray-700">
                                    ¥{expandedData.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <div></div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-green-600">
                                    ${(expandedData.totalAmountInBaseCurrency || expandedData.totalAmount * 0.14).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <div></div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[13px] text-gray-500 text-center py-5">暂无明细</p>
                          )}
                        </div>

                        {/* Actions for pending */}
                        {expandedData.status === 'pending' && (
                          <Card className="p-4">
                            <div className="mb-3">
                              <label className="block text-[13px] font-medium mb-1.5 text-gray-700">
                                审批意见
                              </label>
                              <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="输入审批意见（拒绝时必填）..."
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                              />
                            </div>
                            <div className="flex gap-3 justify-end">
                              {expandedData.riskAlerts && expandedData.riskAlerts.length > 0 && (
                                <Button
                                  variant="outline"
                                  onClick={() => openReminderModal(expandedData)}
                                  className="text-violet-600 border-violet-600 hover:bg-violet-50"
                                >
                                  📧 提醒补充
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                onClick={() => handleReject(item.id, comment)}
                                disabled={!comment || processing === item.id}
                                className="text-red-600 border-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processing === item.id ? '处理中...' : '✕ 拒绝'}
                              </Button>
                              <Button
                                onClick={() => handleApprove(item.id)}
                                disabled={processing === item.id}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                {processing === item.id ? '处理中...' : '✓ 批准'}
                              </Button>
                            </div>
                          </Card>
                        )}

                        {/* Status for history */}
                        {expandedData.status === 'approved' && (
                          <div className="p-3 bg-green-100 rounded-lg text-center">
                            <p className="text-[13px] text-green-800 font-medium">✓ 已批准</p>
                          </div>
                        )}

                        {expandedData.status === 'rejected' && (
                          <div className="p-3 bg-red-100 rounded-lg text-center">
                            <p className="text-[13px] text-red-600 font-medium">✗ 已拒绝</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Reminder Modal */}
      {reminderModal?.open && (
        <div
          onClick={() => setReminderModal(null)}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl w-[500px] max-h-[80vh] overflow-auto shadow-2xl"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">📧 发送补充提醒</h3>
              <button
                onClick={() => setReminderModal(null)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5">
              {/* Recipient Info */}
              <div className="mb-4">
                <p className="text-[13px] text-gray-500 mb-1">发送给</p>
                <p className="text-sm font-medium text-gray-900">
                  {reminderModal.submitterName || '用户'} ({reminderModal.submitterEmail || 'email@example.com'})
                </p>
              </div>

              {/* Send Method */}
              <div className="mb-4">
                <p className="text-[13px] font-medium text-gray-700 mb-2">发送方式</p>
                <div className="flex gap-3">
                  {[
                    { value: 'email', label: '📧 邮件' },
                    { value: 'slack', label: '💬 Slack' },
                    { value: 'both', label: '📧💬 两者都发' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                        reminderMethod === option.value
                          ? 'border-2 border-violet-600 bg-purple-50'
                          : 'border border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reminderMethod"
                        value={option.value}
                        checked={reminderMethod === option.value}
                        onChange={(e) => setReminderMethod(e.target.value as 'email' | 'slack' | 'both')}
                        className="hidden"
                      />
                      <span className="text-[13px] text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Select Alerts */}
              <div className="mb-4">
                <p className="text-[13px] font-medium text-gray-700 mb-2">需要补充的内容</p>
                <div className="flex flex-col gap-2">
                  {reminderModal.alerts.map((alert) => (
                    <label
                      key={alert.id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-lg cursor-pointer transition-all ${
                        selectedAlerts.includes(alert.id) ? 'bg-purple-50 border-violet-300' : 'border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAlerts.includes(alert.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAlerts([...selectedAlerts, alert.id]);
                          } else {
                            setSelectedAlerts(selectedAlerts.filter(id => id !== alert.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-[13px] text-gray-700">
                        {riskLevelConfig[alert.level].icon} {alert.message}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="mb-5">
                <p className="text-[13px] font-medium text-gray-700 mb-2">备注信息</p>
                <textarea
                  value={reminderNote}
                  onChange={(e) => setReminderNote(e.target.value)}
                  placeholder="请补充相关材料，如有特殊情况请说明。"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setReminderModal(null)}>
                  取消
                </Button>
                <Button
                  onClick={sendReminder}
                  disabled={selectedAlerts.length === 0 || sendingReminder}
                  className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                >
                  {sendingReminder ? '发送中...' : '发送提醒'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 cursor-zoom-out"
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={previewImage}
              alt="凭证预览"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage(null);
              }}
              className="absolute -top-10 right-0 bg-transparent border-none text-white text-2xl cursor-pointer p-2 hover:text-gray-300"
            >
              ×
            </button>
            <p className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-white/70 text-[13px]">
              点击任意位置关闭
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
