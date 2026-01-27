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

  // 预览附件：PDF在新标签页打开，图片用弹窗预览
  const handlePreviewReceipt = (url: string | null | undefined) => {
    if (!url) return;
    if (url.match(/\.pdf($|\?)/i) || url.startsWith('data:application/pdf')) {
      window.open(url, '_blank');
    } else {
      setPreviewImage(url);
    }
  };
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [balanceWarning, setBalanceWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  // 检查用户角色，非财务角色重定向
  useEffect(() => {
    const savedRole = localStorage.getItem('userRole');
    if (savedRole !== 'finance') {
      router.push('/dashboard');
    } else {
      setRoleChecked(true);
    }
  }, [router]);

  // 获取 FluxPay 钱包余额
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await fetch('/api/payments/balance');
        const result = await response.json();
        if (result.success) {
          setWalletBalance(result.balance);
          setBalanceWarning(result.warning || null);
        } else {
          setWalletBalance(0);
          setBalanceWarning(result.error || 'FluxPay 连接失败');
        }
      } catch (error) {
        setWalletBalance(0);
        setBalanceWarning('无法获取余额');
      }
    };
    fetchBalance();
  }, []);

  useEffect(() => {
    fetchReimbursements();
  }, [activeTab]);

  const fetchReimbursements = async () => {
    setLoading(true);
    try {
      let status = 'approved';
      if (activeTab === 'processing') status = 'processing';
      if (activeTab === 'history') status = 'paid';

      const response = await fetch(`/api/reimbursements?status=${status}&role=finance`);
      const result = await response.json();
      if (result.success) {
        setReimbursements(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  const processPayment = async (id: string) => {
    setProcessing(id);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/payments/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursementId: id }),
      });
      const result = await response.json();

      if (result.success) {
        // Update local state
        setReimbursements(prev => prev.filter(r => r.id !== id));
        setSelectedIds(prev => prev.filter(sid => sid !== id));
        setExpandedId(null);
        setErrorMessage(null);
        alert('付款已发起，正在通过 FluxPay 处理');
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

  // Stats
  const readyForPayment = reimbursements.filter(r => r.status === 'approved').length;
  const totalPayable = reimbursements.reduce((sum, r) =>
    sum + (r.totalAmountInBaseCurrency || r.totalAmount * 0.14), 0
  );
  const selectedTotal = reimbursements
    .filter(r => selectedIds.includes(r.id))
    .reduce((sum, r) => sum + (r.totalAmountInBaseCurrency || r.totalAmount * 0.14), 0);

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
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className={`p-4 border-l-4 ${walletBalance !== null && walletBalance >= totalPayable ? 'border-l-blue-500' : 'border-l-red-500'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">可用余额 (FluxPay)</p>
              {walletBalance === null ? (
                <p className="text-2xl font-bold text-gray-400">加载中...</p>
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              )}
              {balanceWarning ? (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <span>⚠️</span> {balanceWarning}
                </p>
              ) : walletBalance !== null && walletBalance >= totalPayable ? (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <span>✓</span> 余额充足
                </p>
              ) : walletBalance !== null ? (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <span>⚠️</span> 余额不足
                </p>
              ) : null}
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-xl">
              🏦
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">待付款总额</p>
              <p className="text-2xl font-bold text-gray-900">
                ${totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {readyForPayment} 笔待处理
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
              <p className="text-2xl font-bold text-gray-900">0</p>
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
              <p className="text-xs text-gray-500 mb-1">今日已付</p>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-xs text-gray-500 mt-1">笔</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-xl">
              ✅
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b">
        <button
          onClick={() => { setActiveTab('ready'); setSelectedIds([]); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'ready'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          待付款
          {readyForPayment > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
              {readyForPayment}
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
        </button>
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
            <div className="grid grid-cols-[40px_140px_1fr_120px_100px_120px_100px_80px] gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase sticky top-0">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length === reimbursements.length && reimbursements.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
              </div>
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
              const usdAmount = item.totalAmountInBaseCurrency || item.totalAmount * 0.14;

              return (
                <div key={item.id}>
                  {/* Main Row */}
                  <div className={`grid grid-cols-[40px_140px_1fr_120px_100px_120px_100px_80px] gap-2 px-4 py-3.5 items-center border-b transition-colors ${
                    isExpanded ? 'bg-emerald-50' : isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}>
                    {/* Checkbox */}
                    <div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600"
                      />
                    </div>

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
                      <Badge variant="success" className="bg-green-100 text-green-700">
                        ● Ready
                      </Badge>
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
                              const itemUsd = lineItem.amountInBaseCurrency || lineItem.amount * 0.14;
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
                                  {lineItem.receiptUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
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

                          {/* Action Buttons */}
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
              onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
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
