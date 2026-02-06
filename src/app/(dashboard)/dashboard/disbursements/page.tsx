'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  approvedAt?: string;
  items: ReimbursementItem[];
  submitter?: {
    id: string;
    name: string;
    email: string;
    department?: string;
  };
  paymentStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  paymentId?: string;
  aiSuggestions?: any[];
}

const categoryLabels: Record<string, { label: string; icon: string; color: string }> = {
  flight: { label: '机票', icon: '✈️', color: '#3b82f6' },
  train: { label: '火车票', icon: '🚄', color: '#8b5cf6' },
  hotel: { label: '酒店住宿', icon: '🏨', color: '#f59e0b' },
  meal: { label: '餐饮', icon: '🍽️', color: '#ef4444' },
  taxi: { label: '交通', icon: '🚕', color: '#10b981' },
  office_supplies: { label: '办公用品', icon: '📎', color: '#6b7280' },
  ai_token: { label: 'AI 服务', icon: '🤖', color: '#8b5cf6' },
  cloud_resource: { label: '云资源', icon: '☁️', color: '#0ea5e9' },
  client_entertainment: { label: '客户招待', icon: '🤝', color: '#f97316' },
  other: { label: '其他', icon: '📦', color: '#6b7280' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
};

const generateFormId = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const idSuffix = id.slice(-5).toUpperCase();
  return `#RF-${year}-${idSuffix}`;
};

export default function DisbursementsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'ready' | 'processing' | 'history'>('ready');
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  // 自定义打款金额（财务可修改）
  const [customPaymentAmounts, setCustomPaymentAmounts] = useState<Record<string, number>>({});
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, any>>({});
  const [paymentStats, setPaymentStats] = useState<{
    pendingCount: number;
    pendingTotal: number;
    processingCount: number;
    totalPaidCount: number;
    todayPaidCount: number;
  }>({
    pendingCount: 0,
    pendingTotal: 0,
    processingCount: 0,
    totalPaidCount: 0,
    todayPaidCount: 0,
  });

  // 检查用户角色，非财务角色重定向 - 从API获取而不是localStorage
  useEffect(() => {
    const checkRoles = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success && result.roles) {
          // 检查是否有财务权限（finance 或 super_admin）
          const hasFinanceAccess = result.roles.includes('finance') || result.roles.includes('super_admin');
          if (!hasFinanceAccess) {
            router.push('/dashboard');
          } else {
            setRoleChecked(true);
          }
        } else {
          router.push('/dashboard');
        }
      } catch {
        router.push('/dashboard');
      }
    };
    checkRoles();
  }, [router]);

  useEffect(() => {
    fetchReimbursements();
    fetchPaymentStats();
  }, [activeTab]);

  const fetchPaymentStats = async () => {
    try {
      const response = await fetch('/api/payments/stats');
      const result = await response.json();
      if (result.success && result.stats) {
        setPaymentStats(result.stats);
      }
    } catch (error) {
      console.error('Failed to fetch payment stats:', error);
    }
  };

  const fetchReimbursements = async () => {
    setLoading(true);
    try {
      let status = 'approved';
      if (activeTab === 'processing') status = 'processing';
      if (activeTab === 'history') status = 'paid';

      const response = await fetch(`/api/reimbursements?status=${status}&role=finance`);
      const result = await response.json();
      if (result.success) {
        const data = result.data || [];
        setReimbursements(data);

        // 从报销单的 aiSuggestions 中读取已保存的自定义打款金额
        const savedAmounts: Record<string, number> = {};
        for (const item of data) {
          const customAmountInfo = item.aiSuggestions?.find(
            (s: any) => s.type === 'custom_payment_amount'
          );
          if (customAmountInfo?.amount) {
            savedAmounts[item.id] = customAmountInfo.amount;
          }
        }
        setCustomPaymentAmounts(savedAmounts);
      }
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  // 手动刷新所有处理中的付款状态 - 直接调用 Fluxa API
  const refreshAllPayoutStatuses = async () => {
    if (refreshingStatus || reimbursements.length === 0) return;
    setRefreshingStatus(true);
    console.log('[刷新状态] 开始刷新', reimbursements.length, '笔付款状态...');

    let updatedCount = 0;
    let errorCount = 0;

    for (const item of reimbursements) {
      // 使用 findLast 获取最新的 payout 记录（避免查询旧的过期记录）
      const allPayouts = (item.aiSuggestions || []).filter(
        (s: any) => s.type === 'fluxa_payout_initiated'
      );
      const payoutInfo = allPayouts.length > 0 ? allPayouts[allPayouts.length - 1] : null;
      if (!payoutInfo?.payoutId) {
        console.log('[刷新状态] 跳过, 无 payoutId:', item.id);
        continue;
      }

      try {
        console.log('[刷新状态] 同步 payoutId:', payoutInfo.payoutId);
        // 使用新的 sync-status API 直接调用 Fluxa
        const res = await fetch('/api/payments/sync-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payoutId: payoutInfo.payoutId,
            reimbursementId: item.id,
          }),
        });
        const data = await res.json();
        console.log('[刷新状态] 响应:', data.success, data.status, data.dbUpdated);

        if (data.success) {
          setPayoutStatuses(prev => ({ ...prev, [item.id]: data }));
          if (data.dbUpdated) updatedCount++;
        } else {
          console.error('[刷新状态] 失败:', data.error);
          errorCount++;
        }
      } catch (error) {
        console.error('[刷新状态] 错误:', error);
        errorCount++;
      }
    }

    setRefreshingStatus(false);

    if (updatedCount > 0) {
      alert(`已更新 ${updatedCount} 笔付款状态，正在刷新列表...`);
      fetchReimbursements();
      fetchPaymentStats();
    } else if (errorCount > 0) {
      alert(`刷新失败 ${errorCount} 笔，请检查 Vercel 日志查看详情`);
    } else {
      alert('所有状态已是最新，无需更新');
    }
  };

  // 处理中 tab: 轮询 Fluxa payout 状态，自动更新 processing→paid / processing→approved
  const checkPayoutStatuses = async (items: Reimbursement[]) => {
    let hasStatusChange = false;
    for (const item of items) {
      const payoutInfo = item.aiSuggestions?.find(
        (s: any) => s.type === 'fluxa_payout_initiated'
      );
      if (!payoutInfo?.payoutId) continue;

      try {
        const res = await fetch(`/api/payments/status/${payoutInfo.payoutId}`);
        const data = await res.json();
        if (data.success) {
          setPayoutStatuses(prev => ({ ...prev, [item.id]: data }));
          if (data.statusChanged) hasStatusChange = true;
        }
      } catch {
        // ignore individual check failures
      }
    }
    // 如果有状态变化（succeeded/failed/expired），刷新列表
    if (hasStatusChange) {
      fetchReimbursements();
    }
  };

  // 处理中 tab 加载时自动检查状态
  useEffect(() => {
    if (activeTab === 'processing' && reimbursements.length > 0 && !loading) {
      checkPayoutStatuses(reimbursements);
      // 每 30 秒轮询一次
      const interval = setInterval(() => {
        checkPayoutStatuses(reimbursements);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, reimbursements.length, loading]);

  // 获取报销单的打款金额（自定义金额或原金额）
  const getPaymentAmount = (item: Reimbursement) => {
    const originalAmount = item.totalAmountInBaseCurrency || 0;
    return customPaymentAmounts[item.id] ?? originalAmount;
  };

  // 设置自定义打款金额（仅更新本地状态，不保存到后端）
  const setCustomAmount = (id: string, amount: number, maxAmount: number) => {
    // 确保金额在有效范围内
    const validAmount = Math.max(0.01, Math.min(amount, maxAmount));
    setCustomPaymentAmounts(prev => ({ ...prev, [id]: validAmount }));
  };

  // 保存自定义打款金额到后端
  const saveCustomAmount = async (id: string, amount: number) => {
    try {
      const response = await fetch(`/api/reimbursements/${id}/payment-amount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPaymentAmount: amount }),
      });
      const result = await response.json();
      if (!result.success) {
        setErrorMessage(result.error || '保存打款金额失败');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Save custom amount error:', error);
      setErrorMessage('保存打款金额失败');
      return false;
    }
  };

  // 重置自定义打款金额
  const resetCustomAmount = async (id: string) => {
    try {
      const response = await fetch(`/api/reimbursements/${id}/payment-amount`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        setCustomPaymentAmounts(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Reset custom amount error:', error);
      return false;
    }
  };

  const processPayment = async (id: string) => {
    setProcessing(id);
    setErrorMessage(null);
    try {
      // 获取自定义金额（如果有）
      const customAmount = customPaymentAmounts[id];
      const requestBody: any = { reimbursementId: id };
      if (customAmount !== undefined) {
        requestBody.customAmount = customAmount;
      }

      const response = await fetch(`/api/payments/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();

      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        setSelectedIds(prev => prev.filter(sid => sid !== id));
        setExpandedId(null);
        setErrorMessage(null);
        // 打开 Fluxa 审批链接
        if (result.approvalUrl) {
          window.open(result.approvalUrl, '_blank');
        }
        alert('付款已提交成功，请在 Fluxa 钱包中完成审批');
      } else {
        // 显示详细的错误信息
        const errorMsg = result.message || result.error || '付款处理失败';
        const errorDetails = result.details ? `\n详情: ${result.details}` : '';
        setErrorMessage(`${errorMsg}${errorDetails}`);
        alert(`付款失败: ${errorMsg}${errorDetails}`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      const msg = error instanceof Error ? error.message : '网络错误';
      setErrorMessage(`付款处理失败: ${msg}`);
      alert(`付款处理失败: ${msg}`);
    } finally {
      setProcessing(null);
    }
  };

  const rejectPayment = async (id: string) => {
    const reason = prompt('请输入拒绝原因：');
    if (!reason) return;

    setProcessing(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectReason: `财务拒绝: ${reason}` }),
      });
      const result = await response.json();

      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        setExpandedId(null);
        alert('已拒绝付款');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const processBatchPayment = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要批量处理 ${selectedIds.length} 笔付款吗？`)) return;

    setBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/payments/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reimbursementId: id }),
        });
        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setReimbursements(prev => prev.filter(r => !selectedIds.includes(r.id)));
    setSelectedIds([]);
    setBatchProcessing(false);
    alert(`批量付款完成：${successCount} 笔成功${failCount > 0 ? `，${failCount} 笔失败` : ''}`);
  };

  const processBatchReject = async () => {
    if (selectedIds.length === 0) return;
    const reason = prompt(`请输入批量驳回原因（共 ${selectedIds.length} 笔）：`);
    if (!reason) return;

    setBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/reimbursements/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected', rejectReason: `财务批量驳回: ${reason}` }),
        });
        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setReimbursements(prev => prev.filter(r => !selectedIds.includes(r.id)));
    setSelectedIds([]);
    setBatchProcessing(false);
    alert(`批量驳回完成：${successCount} 笔成功${failCount > 0 ? `，${failCount} 笔失败` : ''}`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === reimbursements.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reimbursements.map(r => r.id));
    }
  };

  // Stats - 计算选中项的总金额
  const selectedTotal = reimbursements
    .filter(r => selectedIds.includes(r.id))
    .reduce((sum, r) => {
      const originalAmount = r.totalAmountInBaseCurrency || 0;
      return sum + (customPaymentAmounts[r.id] ?? originalAmount);
    }, 0);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  // 等待角色检查完成
  if (!roleChecked) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="text-gray-500">验证权限...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">付款处理</h1>
          <p className="text-sm text-gray-500 mt-1">
            审核报销表单，验证明细，处理付款
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="text-gray-600">
            <span className="mr-2">📊</span> 导出报表
          </Button>
          {selectedIds.length > 0 && (
            <>
              <Button
                onClick={processBatchReject}
                disabled={batchProcessing}
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {batchProcessing ? '处理中...' : (
                  <>
                    <span className="mr-2">✕</span>
                    批量驳回 ({selectedIds.length})
                  </>
                )}
              </Button>
              <Button
                onClick={processBatchPayment}
                disabled={batchProcessing}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md"
              >
                {batchProcessing ? '处理中...' : (
                  <>
                    <span className="mr-2">💳</span>
                    批量付款 ({selectedIds.length})
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span>⚠️</span>
            {errorMessage}
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">待付款总额</p>
              <p className="text-2xl font-bold text-gray-900">
                ${paymentStats.pendingTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {paymentStats.pendingCount} 笔待处理
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl">
              💰
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">处理中</p>
              <p className="text-2xl font-bold text-gray-900">{paymentStats.processingCount}</p>
              <p className="text-xs text-gray-500 mt-1">正在打款</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-xl">
              ⏳
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">已付款</p>
              <p className="text-2xl font-bold text-gray-900">{paymentStats.totalPaidCount}</p>
              <p className="text-xs text-gray-500 mt-1">
                今日 {paymentStats.todayPaidCount} 笔
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-xl">
              ✅
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4 border-b">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setActiveTab('ready'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'ready'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            待付款
            {paymentStats.pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                {paymentStats.pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('processing'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'processing'
                ? 'text-purple-600 border-purple-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            处理中
            {paymentStats.processingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-600 rounded-full">
                {paymentStats.processingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('history'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'history'
                ? 'text-green-600 border-green-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            付款历史
            {paymentStats.totalPaidCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-600 rounded-full">
                {paymentStats.totalPaidCount}
              </span>
            )}
          </button>
        </div>
        {activeTab === 'processing' && (
          <button
            onClick={refreshAllPayoutStatuses}
            disabled={refreshingStatus}
            className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {refreshingStatus ? '刷新中...' : '🔄 刷新状态'}
          </button>
        )}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="搜索表单编号或员工..."
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <span className="mr-1">⚙️</span> 筛选
          </Button>
          <Button variant="outline" size="sm" className="text-gray-600">
            <span className="mr-1">↕️</span> 排序: 日期
          </Button>
        </div>
      </div>

      {/* Selected Info Bar */}
      {selectedIds.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-blue-700">
            已选择 <strong>{selectedIds.length}</strong> 项，
            总金额 <strong>${selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </p>
          <Button
            size="sm"
            onClick={() => setSelectedIds([])}
            variant="outline"
            className="text-blue-600 border-blue-300"
          >
            取消选择
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="flex-1 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">加载中...</div>
        ) : reimbursements.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
              {activeTab === 'ready' ? '📋' : activeTab === 'processing' ? '⏳' : '✅'}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {activeTab === 'ready' ? '没有待付款的报销' : activeTab === 'processing' ? '没有处理中的付款' : '暂无付款记录'}
            </h3>
            <p className="text-gray-500">
              {activeTab === 'ready' ? '审批通过的报销将在这里显示' : ''}
            </p>
          </div>
        ) : (
          <div className="overflow-auto h-full">
            {/* Table Header */}
            <div className={`grid ${activeTab === 'ready' ? 'grid-cols-[40px_140px_1fr_120px_100px_120px_100px_80px]' : 'grid-cols-[140px_1fr_120px_100px_120px_100px_80px]'} gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase sticky top-0`}>
              {activeTab === 'ready' && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === reimbursements.length && reimbursements.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                </div>
              )}
              <div>表单编号</div>
              <div>员工</div>
              <div>提交日期</div>
              <div>费用项</div>
              <div className="text-right">金额</div>
              <div className="text-center">状态</div>
              <div></div>
            </div>

            {/* Table Rows */}
            {reimbursements.map((item) => {
              const isExpanded = expandedId === item.id;
              const isSelected = selectedIds.includes(item.id);
              const formId = generateFormId(item.createdAt, item.id);
              const usdAmount = item.totalAmountInBaseCurrency || 0;

              return (
                <div key={item.id}>
                  {/* Main Row */}
                  <div className={`grid ${activeTab === 'ready' ? 'grid-cols-[40px_140px_1fr_120px_100px_120px_100px_80px]' : 'grid-cols-[140px_1fr_120px_100px_120px_100px_80px]'} gap-2 px-4 py-3.5 items-center border-b transition-colors ${
                    isExpanded ? 'bg-emerald-50' : isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}>
                    {/* Checkbox - only on ready tab */}
                    {activeTab === 'ready' && (
                      <div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600"
                        />
                      </div>
                    )}

                    {/* Form ID */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="text-left text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      {formId}
                    </button>

                    {/* Employee */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
                        {item.submitter?.name?.slice(0, 1) || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.submitter?.name || '用户'}</p>
                        <p className="text-xs text-gray-500">{item.submitter?.department || '未知部门'}</p>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-sm text-gray-600">
                      {formatDate(item.approvedAt || item.submittedAt || item.createdAt)}
                    </div>

                    {/* Subject */}
                    <div className="text-sm text-gray-900">
                      {item.title}
                      <span className="ml-1 text-xs text-gray-500">{item.items?.length || 0} 项</span>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="text-center">
                      {activeTab === 'ready' && (
                        <Badge variant="success" className="bg-green-100 text-green-700">
                          ● Ready
                        </Badge>
                      )}
                      {activeTab === 'processing' && (() => {
                        const live = payoutStatuses[item.id];
                        const st = live?.status || 'pending_authorization';
                        const labels: Record<string, { text: string; cls: string }> = {
                          pending_authorization: { text: '待审批', cls: 'bg-amber-100 text-amber-700' },
                          authorized: { text: '已授权', cls: 'bg-blue-100 text-blue-700' },
                          signed: { text: '已签名', cls: 'bg-blue-100 text-blue-700' },
                          broadcasting: { text: '广播中', cls: 'bg-purple-100 text-purple-700' },
                        };
                        const info = labels[st] || { text: 'Processing', cls: 'bg-amber-100 text-amber-700' };
                        return (
                          <Badge className={info.cls}>
                            ● {info.text}
                          </Badge>
                        );
                      })()}
                      {activeTab === 'history' && (
                        <Badge className="bg-blue-100 text-blue-700">
                          ● Paid
                        </Badge>
                      )}
                    </div>

                    {/* Expand */}
                    <div className="text-center">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className={`text-gray-400 hover:text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-b px-4 py-5">
                      <div className="grid grid-cols-[1fr_300px] gap-6">
                        {/* Left: Line Items */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              <span>📋</span> 报销明细 (REIMBURSEMENT BREAKDOWN)
                            </h4>
                          </div>
                          <div className="bg-white rounded-lg border overflow-hidden">
                            <div className="grid grid-cols-[100px_1fr_120px_100px] gap-2 px-4 py-2.5 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                              <div>日期</div>
                              <div>描述</div>
                              <div>类别</div>
                              <div className="text-right">金额</div>
                            </div>
                            {item.items?.map((lineItem, idx) => {
                              const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                              const itemUsd = lineItem.amountInBaseCurrency || 0;
                              return (
                                <div key={idx} className={`grid grid-cols-[100px_1fr_120px_100px] gap-2 px-4 py-3 items-center ${
                                  idx < (item.items?.length || 0) - 1 ? 'border-b border-gray-100' : ''
                                }`}>
                                  <div className="text-sm text-gray-600">
                                    {formatDate(lineItem.date)}
                                  </div>
                                  <div className="text-sm text-gray-900">
                                    {lineItem.description || catInfo.label}
                                  </div>
                                  <div>
                                    <span
                                      className="text-xs px-2 py-1 rounded-full"
                                      style={{
                                        backgroundColor: `${catInfo.color}15`,
                                        color: catInfo.color
                                      }}
                                    >
                                      {catInfo.label}
                                    </span>
                                  </div>
                                  <div className="text-right text-sm font-medium text-gray-900">
                                    ${itemUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              );
                            })}
                            {/* Total */}
                            <div className="grid grid-cols-[100px_1fr_120px_100px] gap-2 px-4 py-3 bg-gray-50 border-t">
                              <div></div>
                              <div className="text-sm font-semibold text-gray-700">Total Verified</div>
                              <div></div>
                              <div className="text-right text-sm font-bold text-gray-900">
                                ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </div>
                            </div>

                            {/* 财务打款金额编辑 - 仅在待付款tab显示 */}
                            {activeTab === 'ready' && (
                              <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-emerald-700">💳 打款金额</span>
                                    <span className="text-xs text-emerald-600">
                                      (可根据政策限额调整，不超过报销金额)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {editingAmountId === item.id ? (
                                      <>
                                        <span className="text-sm text-gray-600">$</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0.01"
                                          max={usdAmount}
                                          value={customPaymentAmounts[item.id] ?? usdAmount}
                                          onChange={(e) => {
                                            const value = parseFloat(e.target.value) || 0;
                                            setCustomAmount(item.id, value, usdAmount);
                                          }}
                                          className="w-28 px-2 py-1 text-right text-sm font-bold border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                          autoFocus
                                        />
                                        <button
                                          onClick={async () => {
                                            const amount = customPaymentAmounts[item.id] ?? usdAmount;
                                            const saved = await saveCustomAmount(item.id, amount);
                                            if (saved) {
                                              setEditingAmountId(null);
                                            }
                                          }}
                                          className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                        >
                                          确定
                                        </button>
                                        <button
                                          onClick={async () => {
                                            await resetCustomAmount(item.id);
                                            setEditingAmountId(null);
                                          }}
                                          className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                        >
                                          重置
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-lg font-bold text-emerald-700">
                                          ${getPaymentAmount(item).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                        {customPaymentAmounts[item.id] !== undefined && (
                                          <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                                            已调整
                                          </span>
                                        )}
                                        <button
                                          onClick={() => setEditingAmountId(item.id)}
                                          className="px-2 py-1 text-xs text-emerald-600 border border-emerald-300 rounded hover:bg-emerald-100"
                                        >
                                          ✏️ 修改
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {customPaymentAmounts[item.id] !== undefined && customPaymentAmounts[item.id] < usdAmount && (
                                  <p className="text-xs text-amber-600 mt-2">
                                    ⚠️ 打款金额已调整为 ${customPaymentAmounts[item.id].toFixed(2)}，
                                    比原金额少 ${(usdAmount - customPaymentAmounts[item.id]).toFixed(2)} USDC
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Attachments & Actions */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                            <span>📎</span> 单据附件 (SUPPORTING DOCS)
                          </h4>
                          <div className="space-y-2 mb-4">
                            {item.items?.filter(i => i.receiptUrl).map((lineItem, idx) => (
                              <div
                                key={idx}
                                onClick={() => handlePreviewReceipt(lineItem.receiptUrl)}
                                className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                              >
                                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                                  {(lineItem.receiptUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) || lineItem.receiptUrl?.startsWith('data:image/')) ? (
                                    <img src={lineItem.receiptUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-2xl">📄</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {lineItem.receiptFileName || `凭证 ${idx + 1}`}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {categoryLabels[lineItem.category]?.label || '其他'}
                                  </p>
                                </div>
                                <button
                                  className="text-gray-400 hover:text-blue-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePreviewReceipt(lineItem.receiptUrl);
                                  }}
                                >
                                  👁
                                </button>
                              </div>
                            ))}
                            {!item.items?.some(i => i.receiptUrl) && (
                              <div className="p-4 text-center text-gray-500 text-sm bg-white border rounded-lg">
                                暂无附件
                              </div>
                            )}
                          </div>

                          {item.items?.some(i => i.receiptUrl) && (
                            <button className="w-full text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1 mb-4">
                              <span>⬇️</span> 下载全部附件 (ZIP)
                            </button>
                          )}

                          {/* Action Buttons - only on Ready tab */}
                          {activeTab === 'ready' && (
                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                variant="outline"
                                onClick={() => rejectPayment(item.id)}
                                disabled={processing === item.id}
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                <span className="mr-1">✕</span> Reject Form
                              </Button>
                              <Button
                                onClick={() => processPayment(item.id)}
                                disabled={processing === item.id}
                                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                              >
                                {processing === item.id ? '处理中...' : (
                                  <>
                                    <span className="mr-1">💳</span> Process Payment
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          {/* Processing tab - show payout status & approval link */}
                          {activeTab === 'processing' && (() => {
                            const payoutInfo = item.aiSuggestions?.find(
                              (s: any) => s.type === 'fluxa_payout_initiated'
                            );
                            const liveStatus = payoutStatuses[item.id];
                            const statusDesc = liveStatus?.statusDescription || '等待 Fluxa 钱包审批';
                            const approvalUrl = liveStatus?.approvalUrl || payoutInfo?.approvalUrl;
                            const isFailed = liveStatus?.status === 'failed' || liveStatus?.status === 'expired';
                            const usdAmt = item.totalAmountInBaseCurrency || 0;

                            return (
                              <div className="pt-2 border-t space-y-2">
                                {isFailed ? (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm font-medium text-red-800 mb-1">
                                      打款失败
                                    </p>
                                    <p className="text-xs text-red-600">
                                      金额: ${usdAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                                    </p>
                                    {liveStatus?.errorMessage && (
                                      <p className="text-xs text-red-600 mt-1">
                                        原因: {liveStatus.errorMessage}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-sm font-medium text-amber-800 mb-1">
                                      {statusDesc}
                                    </p>
                                    <p className="text-xs text-amber-600">
                                      金额: ${usdAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                                    </p>
                                    {liveStatus?.txHash && (
                                      <p className="text-xs text-gray-500 mt-1 font-mono">
                                        TxHash: {liveStatus.txHash.slice(0, 10)}...{liveStatus.txHash.slice(-8)}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* 操作按钮 */}
                                <div className="flex gap-2">
                                  {approvalUrl && !isFailed && (
                                    <a
                                      href={approvalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 text-center py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                      前往 Fluxa 钱包审批
                                    </a>
                                  )}

                                  {/* 退回按钮 - 打款失败或等待审批时都可以退回 */}
                                  <Button
                                    variant="outline"
                                    onClick={() => rejectPayment(item.id)}
                                    disabled={processing === item.id}
                                    className={`${isFailed ? 'flex-1' : ''} text-red-600 border-red-200 hover:bg-red-50`}
                                  >
                                    <span className="mr-1">↩</span> 退回给员工
                                  </Button>
                                </div>

                                {isFailed && (
                                  <Button
                                    onClick={() => processPayment(item.id)}
                                    disabled={processing === item.id}
                                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                                  >
                                    {processing === item.id ? '处理中...' : (
                                      <>
                                        <span className="mr-1">🔄</span> 重新发起打款
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            );
                          })()}

                          {/* History tab - show paid info */}
                          {activeTab === 'history' && (() => {
                            const payoutInfo = item.aiSuggestions?.find(
                              (s: any) => s.type === 'fluxa_payout_initiated'
                            );
                            return (
                              <div className="pt-2 border-t space-y-2">
                                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                  <p className="text-sm font-medium text-green-800 mb-1">
                                    已完成付款
                                  </p>
                                  <div className="text-xs text-green-700 space-y-1">
                                    <p>金额: ${(payoutInfo?.amountUSDC || item.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC</p>
                                    {payoutInfo?.initiatedAt && (
                                      <p>发起时间: {formatDate(payoutInfo.initiatedAt)}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
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
              alt="凭证预览"
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
