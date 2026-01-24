'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

const statusLabels: Record<string, { label: string; color: string; bgColor: string }> = {
  draft: { label: '草稿', color: '#6b7280', bgColor: '#f3f4f6' },
  pending: { label: '待审批', color: '#d97706', bgColor: '#fef3c7' },
  under_review: { label: '审核中', color: '#2563eb', bgColor: '#dbeafe' },
  approved: { label: '已批准', color: '#16a34a', bgColor: '#dcfce7' },
  rejected: { label: '已拒绝', color: '#dc2626', bgColor: '#fee2e2' },
  processing: { label: '处理中', color: '#7c3aed', bgColor: '#ede9fe' },
  paid: { label: '已付款', color: '#059669', bgColor: '#d1fae5' },
  cancelled: { label: '已取消', color: '#9ca3af', bgColor: '#f3f4f6' },
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

// Currency symbols mapping
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

// Generate reimbursement number based on date and ID
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

  // 刷新列表
  const refreshList = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('status', filter);
      }
      const response = await fetch(`/api/reimbursements?${params.toString()}`);
      const result = await response.json();
      if (result.success) {
        setReimbursements(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch reimbursements:', error);
    }
  };

  // 从 API 获取报销列表
  useEffect(() => {
    const fetchReimbursements = async () => {
      setLoading(true);
      await refreshList();
      setLoading(false);
    };

    fetchReimbursements();
  }, [filter]);

  // 获取展开行详情 - 优先使用列表数据
  useEffect(() => {
    if (!expandedId) {
      setExpandedData(null);
      return;
    }

    // 先从列表中获取基本数据
    const listItem = reimbursements.find(r => r.id === expandedId);
    if (listItem) {
      setExpandedData(listItem);
    }

    // 然后从 API 获取完整数据
    const fetchDetail = async () => {
      setExpandLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${expandedId}`);
        const result = await response.json();
        if (result.success && result.data) {
          setExpandedData(result.data);
        }
        // 如果 API 失败但列表有数据，保持列表数据
      } catch (error) {
        console.error('Failed to fetch detail:', error);
        // 保持列表数据作为 fallback
      } finally {
        setExpandLoading(false);
      }
    };

    fetchDetail();
  }, [expandedId, reimbursements]);

  // 删除草稿
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = reimbursements.find(r => r.id === id);
    if (!item || item.status !== 'draft') return;
    if (!confirm('确定要删除这个草稿吗？')) return;

    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'DELETE',
      });
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

  // 撤回申请
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

  // 过滤搜索
  const filteredReimbursements = reimbursements.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase())
  );

  // 统计
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
    <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 140px)' }}>
      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
              报销申请
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>管理和跟踪你的报销申请</p>
          </div>
          <Link
            href="/dashboard/reimbursements/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '14px'
            }}
          >
            <span>+</span> 新建报销
          </Link>
        </div>

        {/* Stats Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '20px',
        }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              backgroundColor: filter === 'all' ? '#eff6ff' : 'white',
              borderRadius: '12px',
              padding: '16px',
              border: filter === 'all' ? '2px solid #2563eb' : '1px solid #e5e7eb',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>全部报销</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{stats.total}</p>
          </button>
          <button
            onClick={() => setFilter('pending')}
            style={{
              backgroundColor: filter === 'pending' ? '#fef3c7' : 'white',
              borderRadius: '12px',
              padding: '16px',
              border: filter === 'pending' ? '2px solid #d97706' : '1px solid #e5e7eb',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>待审批</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
          </button>
          <button
            onClick={() => setFilter('approved')}
            style={{
              backgroundColor: filter === 'approved' ? '#dcfce7' : 'white',
              borderRadius: '12px',
              padding: '16px',
              border: filter === 'approved' ? '2px solid #16a34a' : '1px solid #e5e7eb',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>已批准</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{stats.approved}</p>
          </button>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #e5e7eb',
          }}>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>报销总额</p>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>
              ¥{stats.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '12px 16px',
          border: '1px solid #e5e7eb',
          marginBottom: '16px',
        }}>
          <input
            type="text"
            placeholder="搜索报销..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Table */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '32px 140px 1.5fr 100px 100px 140px 100px 140px 120px',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '12px',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
            alignItems: 'center',
          }}>
            <div></div>
            <div>报销编号</div>
            <div>报销说明</div>
            <div>提交日期</div>
            <div>状态</div>
            <div style={{ textAlign: 'right' }}>原币金额</div>
            <div style={{ textAlign: 'center' }}>汇率</div>
            <div style={{ textAlign: 'right' }}>报销金额</div>
            <div style={{ textAlign: 'center' }}>操作</div>
          </div>

          {/* Table Body */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {loading && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                加载中...
              </div>
            )}

            {!loading && filteredReimbursements.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: '24px'
                }}>
                  📄
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                  {search ? '未找到匹配的报销记录' : '还没有报销记录'}
                </h3>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
                  {search ? '请尝试其他搜索关键词' : '创建你的第一笔报销'}
                </p>
                {!search && (
                  <Link
                    href="/dashboard/reimbursements/new"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: 'white',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    + 新建报销
                  </Link>
                )}
              </div>
            )}

            {!loading && filteredReimbursements.map((item) => {
              const statusInfo = statusLabels[item.status] || statusLabels.draft;
              const isExpanded = expandedId === item.id;
              const reimbursementNo = generateReimbursementNumber(item.createdAt, item.id);

              // Calculate original currency info from items
              const firstItem = item.items?.[0];
              const originalCurrency = firstItem?.currency || 'CNY';
              const originalAmount = item.items?.reduce((sum, i) => sum + i.amount, 0) || item.totalAmount;
              const currencySymbol = currencySymbols[originalCurrency] || originalCurrency;

              // Calculate average exchange rate
              const hasMultipleCurrencies = item.items?.some(i => i.currency !== originalCurrency);
              const avgExchangeRate = item.totalAmountInBaseCurrency && originalAmount > 0
                ? item.totalAmountInBaseCurrency / originalAmount
                : (originalCurrency === 'CNY' ? 1 : 0.14);

              // Check if row can show actions
              const canWithdraw = item.status === 'pending';
              const canDelete = item.status === 'draft';

              return (
                <div key={item.id}>
                  {/* Main Row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 140px 1.5fr 100px 100px 140px 100px 140px 120px',
                      gap: '8px',
                      padding: '14px 16px',
                      borderBottom: isExpanded ? 'none' : '1px solid #e5e7eb',
                      cursor: 'pointer',
                      backgroundColor: isExpanded ? '#eff6ff' : 'white',
                      transition: 'background-color 0.15s',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    {/* Expand Icon */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#6b7280',
                      transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}>
                      ▶
                    </div>

                    {/* Reimbursement Number */}
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#2563eb',
                      fontFamily: 'monospace',
                    }}>
                      {reimbursementNo}
                    </div>

                    {/* Description */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: '12px', color: '#6b7280' }}>
                        {item.items?.length || 0} 项费用
                      </p>
                    </div>

                    {/* Submit Date */}
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      {formatDate(item.submittedAt || item.createdAt)}
                    </div>

                    {/* Status */}
                    <div>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        backgroundColor: statusInfo.bgColor,
                        color: statusInfo.color,
                      }}>
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Original Amount */}
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                        {currencySymbol}{originalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </p>
                      <p style={{ fontSize: '11px', color: '#6b7280' }}>
                        {hasMultipleCurrencies ? '多币种' : originalCurrency}
                      </p>
                    </div>

                    {/* Exchange Rate */}
                    <div style={{ textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>
                      {hasMultipleCurrencies ? '-' : avgExchangeRate.toFixed(4)}
                    </div>

                    {/* Reimbursement Amount (in base currency) */}
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>
                        ¥{item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </p>
                      <p style={{ fontSize: '11px', color: '#6b7280' }}>CNY</p>
                    </div>

                    {/* Actions */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'center',
                    }} onClick={(e) => e.stopPropagation()}>
                      {canWithdraw && (
                        <button
                          onClick={(e) => handleWithdraw(item.id, e)}
                          disabled={actionLoading === item.id}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: '#d97706',
                            backgroundColor: 'white',
                            border: '1px solid #d97706',
                            borderRadius: '4px',
                            cursor: actionLoading === item.id ? 'not-allowed' : 'pointer',
                            opacity: actionLoading === item.id ? 0.5 : 1,
                          }}
                        >
                          {actionLoading === item.id ? '...' : '撤销'}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={(e) => handleDelete(item.id, e)}
                          disabled={actionLoading === item.id}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: '#dc2626',
                            backgroundColor: 'white',
                            border: '1px solid #dc2626',
                            borderRadius: '4px',
                            cursor: actionLoading === item.id ? 'not-allowed' : 'pointer',
                            opacity: actionLoading === item.id ? 0.5 : 1,
                          }}
                        >
                          {actionLoading === item.id ? '...' : '删除'}
                        </button>
                      )}
                      {!canWithdraw && !canDelete && (
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>-</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div style={{
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #e5e7eb',
                      padding: '16px 16px 16px 48px',
                    }}>
                      {expandLoading && !expandedData && (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
                          加载中...
                        </div>
                      )}

                      {expandedData && expandedData.id === item.id && (
                        <div>
                          {/* Detail Header */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                          }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                              费用明细 ({expandedData.items?.length || 0} 项)
                            </h4>
                            {expandedData.status === 'draft' && (
                              <Link
                                href={`/dashboard/reimbursements/${expandedData.id}/edit`}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  color: '#2563eb',
                                  backgroundColor: 'white',
                                  border: '1px solid #2563eb',
                                  borderRadius: '4px',
                                  textDecoration: 'none',
                                }}
                              >
                                编辑
                              </Link>
                            )}
                          </div>

                          {/* Line Items Table */}
                          {expandedData.items && expandedData.items.length > 0 ? (
                            <div style={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              overflow: 'hidden',
                            }}>
                              {/* Items Header */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr 120px 100px 120px',
                                gap: '12px',
                                padding: '10px 14px',
                                backgroundColor: '#f9fafb',
                                borderBottom: '1px solid #e5e7eb',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#6b7280',
                                textTransform: 'uppercase',
                              }}>
                                <div>费用项目</div>
                                <div>类别</div>
                                <div style={{ textAlign: 'right' }}>原币金额</div>
                                <div style={{ textAlign: 'center' }}>汇率</div>
                                <div style={{ textAlign: 'right' }}>折算金额</div>
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
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '2fr 1fr 120px 100px 120px',
                                      gap: '12px',
                                      padding: '12px 14px',
                                      borderBottom: idx < (expandedData.items?.length || 0) - 1 ? '1px solid #f3f4f6' : 'none',
                                      alignItems: 'center',
                                    }}
                                  >
                                    {/* Item Description */}
                                    <div>
                                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                                        {lineItem.description || catInfo.label}
                                      </p>
                                      {lineItem.vendor && (
                                        <p style={{ fontSize: '11px', color: '#6b7280' }}>
                                          {lineItem.vendor}
                                        </p>
                                      )}
                                      {lineItem.receiptUrl && (
                                        <p
                                          style={{
                                            fontSize: '11px',
                                            color: '#2563eb',
                                            marginTop: '2px',
                                            cursor: 'pointer',
                                          }}
                                          onClick={() => setPreviewImage(lineItem.receiptUrl || null)}
                                        >
                                          📎 查看凭证
                                        </p>
                                      )}
                                    </div>

                                    {/* Category */}
                                    <div>
                                      <span style={{
                                        fontSize: '12px',
                                        color: '#374151',
                                        padding: '3px 8px',
                                        backgroundColor: '#f3f4f6',
                                        borderRadius: '4px',
                                      }}>
                                        {catInfo.icon} {catInfo.label}
                                      </span>
                                    </div>

                                    {/* Original Amount */}
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                                        {itemSymbol}{lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                      </p>
                                      <p style={{ fontSize: '10px', color: '#6b7280' }}>{itemCurrency}</p>
                                    </div>

                                    {/* Exchange Rate */}
                                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
                                      {exchangeRate.toFixed(4)}
                                    </div>

                                    {/* Converted Amount */}
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>
                                        ¥{convertedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Total Row */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr 120px 100px 120px',
                                gap: '12px',
                                padding: '12px 14px',
                                backgroundColor: '#f9fafb',
                                borderTop: '1px solid #e5e7eb',
                                alignItems: 'center',
                              }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                                  合计
                                </div>
                                <div></div>
                                <div></div>
                                <div></div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a' }}>
                                    ¥{expandedData.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                              暂无明细
                            </p>
                          )}

                          {/* Reject Reason */}
                          {expandedData.status === 'rejected' && expandedData.rejectReason && (
                            <div style={{
                              backgroundColor: '#fee2e2',
                              borderRadius: '8px',
                              padding: '12px',
                              marginTop: '12px',
                            }}>
                              <p style={{ fontSize: '12px', fontWeight: 500, color: '#dc2626', marginBottom: '4px' }}>
                                拒绝原因
                              </p>
                              <p style={{ fontSize: '13px', color: '#991b1b' }}>
                                {expandedData.rejectReason}
                              </p>
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
        </div>
      </div>


      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out',
          }}
        >
          <div style={{
            position: 'relative',
            maxWidth: '90vw',
            maxHeight: '90vh',
          }}>
            <img
              src={previewImage}
              alt="凭证预览"
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage(null);
              }}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                backgroundColor: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '8px',
              }}
            >
              ×
            </button>
            <p style={{
              position: 'absolute',
              bottom: '-36px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '13px',
            }}>
              点击任意位置关闭
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
