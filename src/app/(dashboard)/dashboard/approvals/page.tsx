'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  amountInBaseCurrency?: number;
  date: string;
  receiptUrl?: string;
  receiptFileName?: string;
  vendor?: string;
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

interface ApprovalChainStep {
  id: string;
  stepOrder: number;
  stepType: string;
  stepName: string;
  approverId?: string;
  approverRole?: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  comment?: string;
  completedAt?: string;
  approver?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
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
    id: string;
    name: string;
    email: string;
    avatar?: string;
    department?: string;
  };
  riskAlerts?: RiskAlert[];
  approvalChain?: ApprovalChainStep[];
  canApprove?: boolean;
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

const currencySymbols: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  HKD: 'HK$', SGD: 'S$', AUD: 'A$', CAD: 'C$', KRW: '₩',
};

const riskLevelConfig: Record<string, { icon: string; label: string; bgClass: string; textClass: string; borderClass: string }> = {
  high: { icon: '🔴', label: '超标', bgClass: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-500' },
  medium: { icon: '🟡', label: '异常', bgClass: 'bg-amber-50', textClass: 'text-amber-700', borderClass: 'border-amber-500' },
  low: { icon: '🟠', label: '提醒', bgClass: 'bg-orange-50', textClass: 'text-orange-700', borderClass: 'border-orange-500' },
};

const generateReimbursementNumber = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const idSuffix = id.slice(-4).toUpperCase();
  return `BX${year}${month}${day}-${idSuffix}`;
};

interface PolicyRule {
  id: string;
  name: string;
  categories?: string[];
  limit?: { type: 'per_item' | 'per_day' | 'per_month'; amount: number; currency: string; };
}

interface Policy {
  id: string;
  name: string;
  isActive: boolean;
  rules: PolicyRule[];
}

const analyzeRisksWithPolicies = (item: Reimbursement, policies: Policy[]): RiskAlert[] => {
  const alerts: RiskAlert[] = [];
  const activePolicies = policies.filter(p => p.isActive);

  const itemsByDate: Record<string, ReimbursementItem[]> = {};
  item.items?.forEach(expense => {
    const dateKey = expense.date?.split('T')[0] || 'unknown';
    if (!itemsByDate[dateKey]) itemsByDate[dateKey] = [];
    itemsByDate[dateKey].push(expense);
  });

  for (const policy of activePolicies) {
    for (const rule of policy.rules) {
      if (!rule.limit) continue;
      const ruleCategories = rule.categories || [];
      const limitAmountUSD = rule.limit.amount;
      const limitType = rule.limit.type;

      if (limitType === 'per_day') {
        for (const [date, dateItems] of Object.entries(itemsByDate)) {
          const matchingItems = dateItems.filter(exp => ruleCategories.includes(exp.category));
          if (matchingItems.length === 0) continue;

          const dailyTotalUSD = matchingItems.reduce((sum, exp) => {
            return sum + (exp.amountInBaseCurrency || 0);
          }, 0);

          if (dailyTotalUSD > limitAmountUSD) {
            const overAmount = dailyTotalUSD - limitAmountUSD;
            const percentage = Math.round((overAmount / limitAmountUSD) * 100);
            alerts.push({
              id: `risk-${date}-${ruleCategories.join('-')}`,
              type: 'over_budget',
              level: percentage > 50 ? 'high' : 'medium',
              message: `${date} ${ruleCategories.map(c => categoryLabels[c]?.label || c).join('+')} $${dailyTotalUSD.toFixed(0)} 超出每日限额 $${limitAmountUSD}`,
              standardValue: limitAmountUSD,
              actualValue: dailyTotalUSD,
              percentage,
            });
          }
        }
      }

      if (limitType === 'per_month') {
        const matchingItems = item.items?.filter(exp => ruleCategories.includes(exp.category)) || [];
        if (matchingItems.length === 0) continue;

        const monthlyTotalUSD = matchingItems.reduce((sum, exp) => {
          return sum + (exp.amountInBaseCurrency || 0);
        }, 0);

        if (monthlyTotalUSD > limitAmountUSD) {
          const overAmount = monthlyTotalUSD - limitAmountUSD;
          const percentage = Math.round((overAmount / limitAmountUSD) * 100);
          alerts.push({
            id: `risk-monthly-${ruleCategories.join('-')}`,
            type: 'over_budget',
            level: 'high',
            message: `${ruleCategories.map(c => categoryLabels[c]?.label || c).join('/')} $${monthlyTotalUSD.toFixed(0)} 超出每月限额 $${limitAmountUSD}`,
            standardValue: limitAmountUSD,
            actualValue: monthlyTotalUSD,
            percentage,
          });
        }
      }
    }
  }

  item.items?.forEach((expense) => {
    const catLabel = categoryLabels[expense.category]?.label || expense.category;
    if (!expense.receiptUrl && expense.amount > 100) {
      alerts.push({
        id: `risk-${expense.id}-attachment`,
        type: 'missing_attachment',
        level: 'low',
        itemId: expense.id,
        message: `${catLabel}费用缺少发票附件`,
      });
      return;
    }
    if (expense.receiptUrl && expense.isOfficialInvoice === false) {
      const action = expense.invoiceValidation?.suggestedAction || '需补充正式发票';
      alerts.push({
        id: `risk-${expense.id}-unofficial`,
        type: 'missing_attachment',
        level: 'medium',
        itemId: expense.id,
        message: `${catLabel}：${action}`,
      });
    }
  });

  return alerts;
};

export default function ApprovalsPage() {
  const { t, language } = useLanguage();

  const localCategoryLabels: Record<string, { label: string; icon: string }> = {
    flight: { label: t.categories.flight, icon: '✈️' },
    train: { label: t.categories.train, icon: '🚄' },
    hotel: { label: t.categories.hotel, icon: '🏨' },
    meal: { label: t.categories.meal, icon: '🍽️' },
    taxi: { label: t.categories.taxi, icon: '🚕' },
    office_supplies: { label: t.categories.office_supplies, icon: '📎' },
    ai_token: { label: t.categories.ai_token, icon: '🤖' },
    cloud_resource: { label: t.categories.cloud_resource, icon: '☁️' },
    client_entertainment: { label: t.categories.client_entertainment, icon: '🤝' },
    other: { label: t.categories.other, icon: '📦' },
  };

  const localRiskLevelConfig: Record<string, { icon: string; label: string; bgClass: string; textClass: string; borderClass: string }> = {
    high: { icon: '🔴', label: t.riskLevels.high, bgClass: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-500' },
    medium: { icon: '🟡', label: t.riskLevels.medium, bgClass: 'bg-amber-50', textClass: 'text-amber-700', borderClass: 'border-amber-500' },
    low: { icon: '🟠', label: t.riskLevels.low, bgClass: 'bg-orange-50', textClass: 'text-orange-700', borderClass: 'border-orange-500' },
  };

  const [filter, setFilter] = useState<'all' | 'pending' | 'auto'>('all');
  const [pendingApprovals, setPendingApprovals] = useState<Reimbursement[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Reimbursement | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 预览附件：将base64 data URL转为Blob URL以提高渲染性能
  const handlePreviewReceipt = (url: string | null | undefined) => {
    if (!url) return;
    if (url.startsWith('data:')) {
      try {
        const parts = url.split(',');
        const meta = parts[0];
        const data = parts.slice(1).join(',');
        const mimeType = meta.split(':')[1].split(';')[0];
        const byteString = atob(data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        setPreviewImage(blobUrl);
        return;
      } catch (e) {
        console.error('Failed to convert data URL:', e);
      }
    }
    setPreviewImage(url);
  };

  const closePreview = () => {
    if (previewImage && previewImage.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
  };
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
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

        const pendingResponse = await fetch('/api/reimbursements?status=pending,under_review&role=approver');
        const pendingResult = await pendingResponse.json();
        if (pendingResult.success) {
          const dataWithRisks = (pendingResult.data || []).map((item: Reimbursement) => ({
            ...item,
            riskAlerts: analyzeRisksWithPolicies(item, loadedPolicies),
          }));
          setPendingApprovals(dataWithRisks);
        }

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

  useEffect(() => {
    if (!expandedId) {
      setExpandedData(null);
      return;
    }
    const listItem = pendingApprovals.find(r => r.id === expandedId);
    if (listItem) setExpandedData(listItem);

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
  }, [expandedId, pendingApprovals, policies]);

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
        setSelectedIds(selectedIds.filter(sid => sid !== id));
        setExpandedId(null);
        setComment('');
      } else {
        alert(result.error || t.common.operationFailed);
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert(t.common.operationFailed);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    if (!reason) {
      alert(t.approvals.enterRejectReason);
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
        setSelectedIds(selectedIds.filter(sid => sid !== id));
        setExpandedId(null);
        setComment('');
      } else {
        alert(result.error || t.common.operationFailed);
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert(t.common.operationFailed);
    } finally {
      setProcessing(null);
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`${t.approvals.confirmBatchApprove}${selectedIds.length}${t.approvals.confirmBatchSuffix}`)) return;

    setBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/reimbursements/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved', comment: t.approvals.batchApproveComment }),
        });
        const result = await response.json();
        if (result.success) {
          successCount++;
          const approved = pendingApprovals.find(a => a.id === id);
          if (approved) {
            approved.status = 'approved';
            setApprovalHistory(prev => [approved, ...prev]);
          }
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setPendingApprovals(prev => prev.filter(a => !selectedIds.includes(a.id)));
    setSelectedIds([]);
    setBatchProcessing(false);
    alert(`${t.approvals.batchComplete}${successCount}${t.approvals.batchSuccess}${failCount > 0 ? `, ${failCount}${t.approvals.batchFailed}` : ''}`);
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === pendingApprovals.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingApprovals.map(a => a.id));
    }
  };

  const stats = {
    pending: pendingApprovals.length,
    totalRequested: pendingApprovals.reduce((sum, a) => sum + (a.totalAmountInBaseCurrency || 0), 0),
    processed: approvalHistory.length,
    withRisks: pendingApprovals.filter(a => (a.riskAlerts?.length || 0) > 0).length,
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const getRiskCount = (item: Reimbursement) => item.riskAlerts?.length || 0;

  const filteredList = filter === 'pending'
    ? pendingApprovals.filter(a => a.status === 'pending')
    : pendingApprovals;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.approvals.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.pending > 0 ? (
              <>{t.approvals.pendingCount}<span className="text-blue-600 font-medium">{stats.pending}{t.approvals.pendingItems}</span>{t.approvals.pendingSuffix}</>
            ) : (
              t.approvals.noPending
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <Button
              onClick={handleBatchApprove}
              disabled={batchProcessing}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-md"
            >
              {batchProcessing ? (
                t.approvals.processingBatch
              ) : (
                <>
                  <span className="mr-2">☰</span>
                  {t.approvals.batchApprove} ({selectedIds.length})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        <Card className="p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">{t.approvals.pendingStat}</p>
              <p className="text-3xl font-bold text-gray-900">{stats.pending}</p>
              {stats.withRisks > 0 && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <span>⚠️</span> {stats.withRisks}{t.approvals.riskWarning}
                </p>
              )}
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl">
              📋
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">{t.approvals.pendingAmount}</p>
              <p className="text-3xl font-bold text-gray-900">
                ${stats.totalRequested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-green-600 mt-1">{t.approvals.thisMonth}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">
              💰
            </div>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">{t.approvals.processed}</p>
              <p className="text-3xl font-bold text-gray-900">{stats.processed}</p>
              <p className="text-xs text-gray-500 mt-1">{t.approvals.historyRecords}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">
              ✅
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            filter === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {t.approvals.allRequests}
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
            filter === 'pending'
              ? 'bg-amber-500 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span>⏳</span> {t.approvals.pendingProcess}
        </button>
      </div>

      {/* Main Content */}
      <Card className="flex-1 overflow-hidden">
        {loading && (
          <div className="p-10 text-center text-gray-500">{t.common.loading}</div>
        )}

        {!loading && filteredList.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
              ✅
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.approvals.noPendingApprovals}</h3>
            <p className="text-gray-500">{t.approvals.pendingWillShow}</p>
          </div>
        )}

        {!loading && filteredList.length > 0 && (
          <div className="overflow-auto h-full">
            {/* Table Header */}
            <div className="grid grid-cols-[40px_1fr_120px_100px_140px_80px] gap-3 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase sticky top-0">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredList.length && filteredList.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              <div>{t.approvals.applicantDesc}</div>
              <div className="text-right">{t.approvals.amount}</div>
              <div className="text-center">{t.approvals.status}</div>
              <div className="text-center">{t.approvals.actionsHeader}</div>
              <div className="text-center">{t.approvals.risk}</div>
            </div>

            {/* List Items */}
            {filteredList.map((item) => {
              const isExpanded = expandedId === item.id;
              const riskCount = getRiskCount(item);
              const isSelected = selectedIds.includes(item.id);
              const usdAmount = item.totalAmountInBaseCurrency || 0;
              const reimbursementNo = generateReimbursementNumber(item.createdAt, item.id);

              return (
                <div key={item.id} className={isExpanded ? 'bg-blue-50/50' : ''}>
                  {/* Main Row */}
                  <div className={`grid grid-cols-[40px_1fr_120px_100px_140px_80px] gap-3 px-5 py-4 items-center border-b transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}>
                    {/* Checkbox */}
                    <div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>

                    {/* Submitter & Description */}
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                        {item.submitter?.name?.slice(0, 2) || t.common.user}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{item.submitter?.name || t.common.user}</p>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">{item.items?.length || 0}{t.approvals.expenseCount}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-gray-600 truncate">{item.title}</p>
                          <span className="text-xs text-gray-400 font-mono">#{reimbursementNo}</span>
                        </div>
                      </div>
                      <span className={`ml-2 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500">
                        ¥{item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="text-center">
                      <Badge variant="warning">{t.approvals.pendingStat}</Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleApprove(item.id); }}
                        disabled={processing === item.id}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-3"
                      >
                        {processing === item.id ? '...' : t.approvals.approve}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          const reason = prompt(t.approvals.enterRejectReason);
                          if (reason) handleReject(item.id, reason);
                        }}
                        disabled={processing === item.id}
                        className="text-red-600 border-red-200 hover:bg-red-50 text-xs px-3"
                      >
                        {t.approvals.reject}
                      </Button>
                    </div>

                    {/* Risk */}
                    <div className="text-center">
                      {riskCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          ⚠️ {riskCount}
                        </span>
                      ) : (
                        <span className="text-green-600 text-lg">✓</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && expandedData && expandedData.id === item.id && (
                    <div className="border-b bg-white">
                      <div className="p-5">
                        {/* Risk Alerts */}
                        {expandedData.riskAlerts && expandedData.riskAlerts.length > 0 && (
                          <div className="mb-5 p-4 bg-red-50 rounded-xl border border-red-200">
                            <h4 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                              {t.approvals.riskAlerts}
                            </h4>
                            <div className="space-y-2">
                              {expandedData.riskAlerts.map((alert) => (
                                <div key={alert.id} className={`flex items-center gap-2 p-2.5 bg-white rounded-lg border-l-4 ${localRiskLevelConfig[alert.level].borderClass}`}>
                                  <span>{localRiskLevelConfig[alert.level].icon}</span>
                                  <span className="text-sm text-gray-700">{alert.message}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Approval Chain */}
                        {expandedData.approvalChain && expandedData.approvalChain.length > 0 && (
                          <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <h4 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                              {t.approvals.approvalProcess}
                            </h4>
                            <div className="flex items-center gap-2 flex-wrap">
                              {expandedData.approvalChain.map((step, idx) => {
                                const isCurrentStep = step.status === 'pending' &&
                                  expandedData.approvalChain?.slice(0, idx).every(s => s.status === 'approved' || s.status === 'skipped');
                                const statusConfig = {
                                  pending: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '⏳' },
                                  approved: { bg: 'bg-green-100', text: 'text-green-700', icon: '✅' },
                                  rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: '❌' },
                                  skipped: { bg: 'bg-gray-100', text: 'text-gray-400', icon: '⏭️' },
                                };
                                const config = statusConfig[step.status] || statusConfig.pending;

                                return (
                                  <div key={step.id} className="flex items-center gap-2">
                                    <div className={`px-3 py-2 rounded-lg ${config.bg} ${isCurrentStep ? 'ring-2 ring-blue-500' : ''}`}>
                                      <div className="flex items-center gap-2">
                                        <span>{config.icon}</span>
                                        <div>
                                          <p className={`text-sm font-medium ${config.text}`}>{step.stepName}</p>
                                          {step.approver && (
                                            <p className="text-xs text-gray-500">{step.approver.name}</p>
                                          )}
                                          {step.completedAt && (
                                            <p className="text-xs text-gray-400">
                                              {new Date(step.completedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {idx < (expandedData.approvalChain?.length || 0) - 1 && (
                                      <span className="text-gray-300">→</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {expandedData.canApprove && (
                              <p className="mt-3 text-sm text-blue-600 font-medium">{t.approvals.yourTurnToApprove}</p>
                            )}
                          </div>
                        )}

                        {/* Line Items with Attachments */}
                        <div className="grid grid-cols-[1fr_280px] gap-5">
                          {/* Line Items */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">{t.approvals.expenseDetails}</h4>
                            <div className="bg-gray-50 rounded-xl overflow-hidden">
                              <div className="grid grid-cols-[1fr_100px_100px_100px] gap-2 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase border-b">
                                <div>{t.approvals.descriptionHeader}</div>
                                <div className="text-center">{t.approvals.dateHeader}</div>
                                <div className="text-right">{t.approvals.amountHeader}</div>
                                <div className="text-right">{t.approvals.usdHeader}</div>
                              </div>
                              {expandedData.items?.map((lineItem, idx) => {
                                const catInfo = localCategoryLabels[lineItem.category] || localCategoryLabels.other;
                                const itemUsd = lineItem.amountInBaseCurrency || 0;
                                const itemCurrency = lineItem.currency || 'CNY';
                                const itemSymbol = currencySymbols[itemCurrency] || itemCurrency;

                                return (
                                  <div key={lineItem.id || idx} className={`grid grid-cols-[1fr_100px_100px_100px] gap-2 px-4 py-3 items-center ${
                                    idx < (expandedData.items?.length || 0) - 1 ? 'border-b border-gray-100' : ''
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg">{catInfo.icon}</span>
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{lineItem.description || catInfo.label}</p>
                                        {lineItem.vendor && <p className="text-xs text-gray-500">{lineItem.vendor}</p>}
                                      </div>
                                    </div>
                                    <div className="text-center text-sm text-gray-600">
                                      {formatDate(lineItem.date)}
                                    </div>
                                    <div className="text-right text-sm font-medium text-gray-900">
                                      {itemSymbol}{lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-right text-sm font-semibold text-green-600">
                                      ${itemUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                  </div>
                                );
                              })}
                              {/* Total */}
                              <div className="grid grid-cols-[1fr_100px_100px_100px] gap-2 px-4 py-3 bg-gray-100 border-t">
                                <div className="text-sm font-semibold text-gray-700">{t.approvals.total}</div>
                                <div></div>
                                <div className="text-right text-sm font-semibold text-gray-700">
                                  ¥{expandedData.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-right text-sm font-bold text-green-600">
                                  ${(expandedData.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Attachments */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">{t.approvals.attachments}</h4>
                            <div className="space-y-2">
                              {expandedData.items?.filter(i => i.receiptUrl).map((lineItem, idx) => {
                                const catInfo = localCategoryLabels[lineItem.category] || localCategoryLabels.other;
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                                    onClick={() => handlePreviewReceipt(lineItem.receiptUrl)}
                                  >
                                    <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center overflow-hidden">
                                      {(lineItem.receiptUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) || lineItem.receiptUrl?.startsWith('data:image/')) ? (
                                        <img src={lineItem.receiptUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-xl">📄</span>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {lineItem.receiptFileName || `${catInfo.label} ${t.approvals.receipt}`}
                                      </p>
                                      <p className="text-xs text-gray-500">{catInfo.label}</p>
                                    </div>
                                    <button
                                      className="p-1.5 text-gray-400 hover:text-blue-600"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePreviewReceipt(lineItem.receiptUrl);
                                      }}
                                    >
                                      👁
                                    </button>
                                  </div>
                                );
                              })}
                              {!expandedData.items?.some(i => i.receiptUrl) && (
                                <div className="p-4 text-center text-gray-500 text-sm bg-gray-50 rounded-lg">
                                  {t.approvals.noAttachments}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons in Detail */}
                            <div className="mt-4 flex gap-2">
                              <Button
                                onClick={() => handleApprove(item.id)}
                                disabled={processing === item.id}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              >
                                {processing === item.id ? t.approvals.processingBatch : `✓ ${t.approvals.approve}`}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  const reason = prompt(t.approvals.enterRejectReason);
                                  if (reason) handleReject(item.id, reason);
                                }}
                                disabled={processing === item.id}
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                ✕ {t.approvals.reject}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={closePreview}
          className="fixed inset-0 bg-black/85 flex items-center justify-center cursor-zoom-out"
          style={{ zIndex: 9999 }}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={previewImage}
              alt={t.reimbursements.receiptPreview}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={(e) => { e.stopPropagation(); closePreview(); }}
              className="absolute -top-10 right-0 text-white text-2xl p-2 hover:text-gray-300"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
