'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  amountInBaseCurrency?: number;
  date: string;
  vendor?: string;
  receiptUrl?: string;
}

interface Reimbursement {
  id: string;
  title: string;
  description?: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
  baseCurrency: string;
  status: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'processing' | 'paid' | 'cancelled';
  submittedAt?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
  items: ReimbursementItem[];
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'danger' | 'info' }> = {
  draft: { label: '草稿', variant: 'default' },
  pending: { label: '待审批', variant: 'warning' },
  under_review: { label: '审核中', variant: 'info' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'danger' },
  processing: { label: '处理中', variant: 'info' },
  paid: { label: '已付款', variant: 'success' },
  cancelled: { label: '已取消', variant: 'default' },
};

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

const generateReimbursementNumber = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const idSuffix = id.slice(-4).toUpperCase();
  return `BX${year}${month}${day}-${idSuffix}`;
};

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Reimbursement | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const refreshList = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const response = await fetch(`/api/reimbursements?${params.toString()}`);
      const result = await response.json();
      if (result.success) setReimbursements(result.data || []);
    } catch (error) {
      console.error('Failed to fetch reimbursements:', error);
    }
  };

  useEffect(() => {
    const fetchReimbursements = async () => {
      setLoading(true);
      await refreshList();
      setLoading(false);
    };
    fetchReimbursements();
  }, [filter]);

  useEffect(() => {
    if (!expandedId) {
      setExpandedData(null);
      return;
    }
    const listItem = reimbursements.find(r => r.id === expandedId);
    if (listItem) setExpandedData(listItem);

    const fetchDetail = async () => {
      setExpandLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${expandedId}`);
        const result = await response.json();
        if (result.success && result.data) setExpandedData(result.data);
      } catch (error) {
        console.error('Failed to fetch detail:', error);
      } finally {
        setExpandLoading(false);
      }
    };
    fetchDetail();
  }, [expandedId, reimbursements]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = reimbursements.find(r => r.id === id);
    if (!item || item.status !== 'draft') return;
    if (!confirm('确定要删除这个草稿吗？')) return;

    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        if (expandedId === id) {
          setExpandedId(null);
          setExpandedData(null);
        }
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleWithdraw = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = reimbursements.find(r => r.id === id);
    if (!item || item.status !== 'pending') return;
    if (!confirm('确定要撤回这个报销申请吗？撤回后将变为草稿状态。')) return;

    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      const result = await response.json();
      if (result.success) {
        await refreshList();
        if (expandedId === id) {
          setExpandedData(prev => prev ? { ...prev, status: 'draft' } : null);
        }
      } else {
        alert(result.error || '撤回失败');
      }
    } catch (error) {
      console.error('Withdraw error:', error);
      alert('撤回失败');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredReimbursements = reimbursements.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: reimbursements.length,
    pending: reimbursements.filter(r => r.status === 'pending' || r.status === 'under_review').length,
    approved: reimbursements.filter(r => r.status === 'approved' || r.status === 'paid').length,
    totalAmount: reimbursements.reduce((sum, r) => sum + r.totalAmount, 0),
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">报销申请</h1>
          <p className="text-sm text-gray-500">管理和跟踪你的报销申请</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/reimbursements/new">+ 新建报销</Link>
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { key: 'all', label: '全部报销', value: stats.total, color: 'text-gray-900' },
          { key: 'pending', label: '待审批', value: stats.pending, color: 'text-amber-600' },
          { key: 'approved', label: '已批准', value: stats.approved, color: 'text-green-600' },
          { key: 'amount', label: '报销总额', value: `¥${stats.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, color: 'text-blue-600', isAmount: true },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => !stat.isAmount && setFilter(stat.key)}
            disabled={stat.isAmount}
            className={cn(
              'rounded-xl p-4 text-left transition-all',
              stat.isAmount ? 'bg-white border border-gray-200 cursor-default' :
              filter === stat.key
                ? 'bg-blue-50 border-2 border-blue-500'
                : 'bg-white border border-gray-200 hover:border-gray-300'
            )}
          >
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-3">
          <Input
            type="text"
            placeholder="搜索报销..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[160px_1.5fr_100px_100px_140px_100px_140px_120px] gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
          <div>报销编号</div>
          <div>报销说明</div>
          <div>提交日期</div>
          <div>状态</div>
          <div className="text-right">原币金额</div>
          <div className="text-center">汇率</div>
          <div className="text-right">报销金额</div>
          <div className="text-center">操作</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-10 text-center text-gray-500">加载中...</div>
          )}

          {!loading && filteredReimbursements.length === 0 && (
            <div className="p-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center text-2xl">
                📄
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                {search ? '未找到匹配的报销记录' : '还没有报销记录'}
              </h3>
              <p className="text-gray-500 text-sm mb-5">
                {search ? '请尝试其他搜索关键词' : '创建你的第一笔报销'}
              </p>
              {!search && (
                <Button asChild>
                  <Link href="/dashboard/reimbursements/new">+ 新建报销</Link>
                </Button>
              )}
            </div>
          )}

          {!loading && filteredReimbursements.map((item) => {
            const statusInfo = statusConfig[item.status] || statusConfig.draft;
            const isExpanded = expandedId === item.id;
            const reimbursementNo = generateReimbursementNumber(item.createdAt, item.id);

            const firstItem = item.items?.[0];
            const originalCurrency = firstItem?.currency || 'CNY';
            const originalAmount = item.items?.reduce((sum, i) => sum + i.amount, 0) || item.totalAmount;
            const currencySymbol = currencySymbols[originalCurrency] || originalCurrency;
            const hasMultipleCurrencies = item.items?.some(i => i.currency !== originalCurrency);
            const avgExchangeRate = item.totalAmountInBaseCurrency && originalAmount > 0
              ? item.totalAmountInBaseCurrency / originalAmount
              : (originalCurrency === 'CNY' ? 1 : 0.14);

            const canWithdraw = item.status === 'pending';
            const canDelete = item.status === 'draft';

            return (
              <div key={item.id}>
                {/* Main Row */}
                <div
                  className={cn(
                    'grid grid-cols-[160px_1.5fr_100px_100px_140px_100px_140px_120px] gap-2 px-4 py-3.5 items-center transition-colors',
                    isExpanded ? 'bg-blue-50' : 'bg-white hover:bg-gray-50',
                    !isExpanded && 'border-b border-gray-100'
                  )}
                >
                  {/* Reimbursement Number - Clickable */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-600 font-mono cursor-pointer"
                  >
                    <span className={cn(
                      'text-[10px] text-gray-400 transition-transform',
                      isExpanded && 'rotate-90'
                    )}>▶</span>
                    {reimbursementNo}
                  </div>

                  {/* Description */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.items?.length || 0} 项费用</p>
                  </div>

                  {/* Submit Date */}
                  <div className="text-sm text-gray-500">
                    {formatDate(item.submittedAt || item.createdAt)}
                  </div>

                  {/* Status */}
                  <div>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>

                  {/* Original Amount */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {currencySymbol}{originalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {hasMultipleCurrencies ? '多币种' : originalCurrency}
                    </p>
                  </div>

                  {/* Exchange Rate */}
                  <div className="text-center text-sm text-gray-500">
                    {hasMultipleCurrencies ? '-' : avgExchangeRate.toFixed(4)}
                  </div>

                  {/* Reimbursement Amount */}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">
                      ¥{item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-gray-500">CNY</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                    {canWithdraw && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleWithdraw(item.id, e)}
                        disabled={actionLoading === item.id}
                        className="text-amber-600 border-amber-600 hover:bg-amber-50"
                      >
                        {actionLoading === item.id ? '...' : '撤销'}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleDelete(item.id, e)}
                        disabled={actionLoading === item.id}
                        className="text-red-600 border-red-600 hover:bg-red-50"
                      >
                        {actionLoading === item.id ? '...' : '删除'}
                      </Button>
                    )}
                    {!canWithdraw && !canDelete && (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="bg-slate-50 border-b border-gray-200 p-4">
                    {expandLoading && !expandedData && (
                      <div className="text-center text-gray-500 py-5">加载中...</div>
                    )}

                    {expandedData && expandedData.id === item.id && (
                      <div>
                        {/* Detail Header */}
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-semibold text-gray-700">
                            费用明细 ({expandedData.items?.length || 0} 项)
                          </h4>
                          {expandedData.status === 'draft' && (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/dashboard/reimbursements/${expandedData.id}/edit`}>
                                编辑
                              </Link>
                            </Button>
                          )}
                        </div>

                        {/* Line Items Table */}
                        {expandedData.items && expandedData.items.length > 0 ? (
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            {/* Items Header */}
                            <div className="grid grid-cols-[2fr_1fr_120px_100px_120px] gap-3 px-3.5 py-2.5 bg-gray-50 border-b text-[11px] font-semibold text-gray-500 uppercase">
                              <div>费用项目</div>
                              <div>类别</div>
                              <div className="text-right">原币金额</div>
                              <div className="text-center">汇率</div>
                              <div className="text-right">折算金额</div>
                            </div>

                            {/* Items Rows */}
                            {expandedData.items.map((lineItem, idx) => {
                              const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                              const itemCurrency = lineItem.currency || 'CNY';
                              const itemSymbol = currencySymbols[itemCurrency] || itemCurrency;
                              const exchangeRate = itemCurrency === 'CNY' ? 1 : (lineItem.amountInBaseCurrency && lineItem.amount > 0 ? lineItem.amountInBaseCurrency / lineItem.amount : 0.14);
                              const convertedAmount = lineItem.amountInBaseCurrency || lineItem.amount * exchangeRate;

                              return (
                                <div
                                  key={lineItem.id}
                                  className={cn(
                                    'grid grid-cols-[2fr_1fr_120px_100px_120px] gap-3 px-3.5 py-3 items-center',
                                    idx < (expandedData.items?.length || 0) - 1 && 'border-b border-gray-100'
                                  )}
                                >
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {lineItem.description || catInfo.label}
                                    </p>
                                    {lineItem.vendor && (
                                      <p className="text-[11px] text-gray-500">{lineItem.vendor}</p>
                                    )}
                                    {lineItem.receiptUrl && (
                                      <p
                                        className="text-[11px] text-blue-600 mt-0.5 cursor-pointer hover:underline"
                                        onClick={() => setPreviewImage(lineItem.receiptUrl || null)}
                                      >
                                        📎 查看凭证
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-700 px-2 py-1 bg-gray-100 rounded">
                                      {catInfo.icon} {catInfo.label}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-gray-900">
                                      {itemSymbol}{lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-[10px] text-gray-500">{itemCurrency}</p>
                                  </div>
                                  <div className="text-center text-xs text-gray-500">
                                    {exchangeRate.toFixed(4)}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-green-600">
                                      ¥{convertedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Total Row */}
                            <div className="grid grid-cols-[2fr_1fr_120px_100px_120px] gap-3 px-3.5 py-3 bg-gray-50 border-t items-center">
                              <div className="text-sm font-semibold text-gray-700">合计</div>
                              <div></div>
                              <div></div>
                              <div></div>
                              <div className="text-right">
                                <p className="text-base font-bold text-green-600">
                                  ¥{expandedData.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 text-center py-5">暂无明细</p>
                        )}

                        {/* Reject Reason */}
                        {expandedData.status === 'rejected' && expandedData.rejectReason && (
                          <div className="mt-3 p-3 bg-red-50 rounded-lg">
                            <p className="text-xs font-medium text-red-600 mb-1">拒绝原因</p>
                            <p className="text-sm text-red-800">{expandedData.rejectReason}</p>
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
              className="absolute -top-10 right-0 text-white text-2xl p-2 hover:opacity-80"
            >
              ×
            </button>
            <p className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-white/70 text-sm">
              点击任意位置关闭
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
