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

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchReimbursements = async () => {
      setLoading(true);
      await refreshList();
      setLoading(false);
    };
    fetchReimbursements();
  }, [filter]);

  // 删除草稿
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个报销单吗？')) return;
    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        if (expandedId === id) setExpandedId(null);
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      alert('删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 提交审批
  const handleSubmit = async (id: string) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      const result = await response.json();
      if (result.success) {
        await refreshList();
      } else {
        alert(result.error || '提交失败');
      }
    } catch (error) {
      alert('提交失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 撤回申请
  const handleWithdraw = async (id: string) => {
    if (!confirm('确定要撤回这个报销申请吗？')) return;
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
      } else {
        alert(result.error || '撤回失败');
      }
    } catch (error) {
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
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getExchangeRate = (item: Reimbursement) => {
    if (item.totalAmountInBaseCurrency && item.totalAmount > 0) {
      return item.totalAmountInBaseCurrency / item.totalAmount;
    }
    return 0.14; // 默认汇率
  };

  return (
    <div>
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
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 100px 1.5fr 120px 80px 100px 90px 140px',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
        }}>
          <div>报销单号</div>
          <div>提交日期</div>
          <div>报销说明</div>
          <div style={{ textAlign: 'right' }}>原币金额</div>
          <div style={{ textAlign: 'right' }}>汇率</div>
          <div style={{ textAlign: 'right' }}>美元金额</div>
          <div style={{ textAlign: 'center' }}>状态</div>
          <div style={{ textAlign: 'center' }}>操作</div>
        </div>

        {/* Table Body */}
        <div>
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
            const exchangeRate = getExchangeRate(item);
            const usdAmount = item.totalAmountInBaseCurrency || item.totalAmount * exchangeRate;
            const isExpanded = expandedId === item.id;
            const isLoading = actionLoading === item.id;

            return (
              <div key={item.id}>
                {/* Main Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 100px 1.5fr 120px 80px 100px 90px 140px',
                    gap: '12px',
                    padding: '14px 16px',
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: isExpanded ? '#f8fafc' : 'white',
                    alignItems: 'center',
                  }}
                >
                  {/* 报销单号 */}
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#2563eb',
                      fontWeight: 500,
                      cursor: item.items?.length > 0 ? 'pointer' : 'default',
                    }}
                    onClick={() => item.items?.length > 0 && setExpandedId(isExpanded ? null : item.id)}
                  >
                    #{item.id.slice(0, 8).toUpperCase()}
                    {item.items?.length > 1 && (
                      <span style={{ marginLeft: '4px', fontSize: '10px' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    )}
                  </div>

                  {/* 提交日期 */}
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {formatDate(item.submittedAt || item.createdAt)}
                  </div>

                  {/* 报销说明 */}
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827', marginBottom: '2px' }}>
                      {item.title}
                    </p>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>
                      {item.items?.length || 0} 项费用
                    </p>
                  </div>

                  {/* 原币金额 */}
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                    ¥{item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>

                  {/* 汇率 */}
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
                    {exchangeRate.toFixed(4)}
                  </div>

                  {/* 美元金额 */}
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#0369a1' }}>
                    ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>

                  {/* 状态 */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      padding: '4px 8px',
                      borderRadius: '9999px',
                      backgroundColor: statusInfo.bgColor,
                      color: statusInfo.color,
                    }}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* 操作 */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    {item.status === 'draft' && (
                      <>
                        <Link
                          href={`/dashboard/reimbursements/${item.id}/edit`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#2563eb',
                            backgroundColor: '#eff6ff',
                            border: 'none',
                            borderRadius: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          编辑
                        </Link>
                        <button
                          onClick={() => handleSubmit(item.id)}
                          disabled={isLoading}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: 'white',
                            backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          提交
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={isLoading}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#dc2626',
                            backgroundColor: '#fee2e2',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          删除
                        </button>
                      </>
                    )}
                    {item.status === 'pending' && (
                      <button
                        onClick={() => handleWithdraw(item.id)}
                        disabled={isLoading}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          color: '#d97706',
                          backgroundColor: '#fef3c7',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        撤回
                      </button>
                    )}
                    {(item.status === 'approved' || item.status === 'paid') && (
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>-</span>
                    )}
                    {item.status === 'rejected' && (
                      <Link
                        href="/dashboard/reimbursements/new"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          color: '#2563eb',
                          backgroundColor: '#eff6ff',
                          border: 'none',
                          borderRadius: '4px',
                          textDecoration: 'none',
                        }}
                      >
                        重新提交
                      </Link>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && item.items && item.items.length > 0 && (
                  <div style={{
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '16px 24px 16px 40px',
                  }}>
                    <div style={{
                      backgroundColor: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                    }}>
                      {/* Detail Header */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1.5fr 1fr 1.2fr 0.8fr 1fr',
                        gap: '8px',
                        padding: '10px 12px',
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#6b7280',
                      }}>
                        <div>供应商</div>
                        <div>费用描述</div>
                        <div>类别</div>
                        <div style={{ textAlign: 'right' }}>原币金额</div>
                        <div style={{ textAlign: 'right' }}>汇率</div>
                        <div style={{ textAlign: 'right' }}>美元金额</div>
                      </div>

                      {/* Detail Rows */}
                      {item.items.map((lineItem, idx) => {
                        const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                        const itemRate = lineItem.currency === 'USD' ? 1 :
                          (lineItem.amountInBaseCurrency && lineItem.amount > 0
                            ? lineItem.amountInBaseCurrency / lineItem.amount
                            : 0.14);
                        const itemUsd = lineItem.amountInBaseCurrency || lineItem.amount * itemRate;

                        return (
                          <div
                            key={lineItem.id || idx}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.2fr 1.5fr 1fr 1.2fr 0.8fr 1fr',
                              gap: '8px',
                              padding: '10px 12px',
                              borderBottom: idx < item.items.length - 1 ? '1px solid #f3f4f6' : 'none',
                              fontSize: '13px',
                            }}
                          >
                            <div style={{ color: '#374151' }}>
                              {lineItem.vendor || '-'}
                            </div>
                            <div style={{ color: '#111827' }}>
                              {lineItem.description || catInfo.label}
                            </div>
                            <div>
                              <span style={{
                                padding: '2px 6px',
                                backgroundColor: '#f3f4f6',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: '#374151',
                              }}>
                                {catInfo.icon} {catInfo.label}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 500, color: '#111827' }}>
                              {lineItem.currency === 'USD' ? '$' : '¥'}
                              {lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                              <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '2px' }}>
                                {lineItem.currency}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>
                              {itemRate.toFixed(4)}
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>
                              ${itemUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reject Reason */}
                    {item.status === 'rejected' && item.rejectReason && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        backgroundColor: '#fee2e2',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#991b1b',
                      }}>
                        <strong>拒绝原因：</strong>{item.rejectReason}
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
  );
}
