'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
}

interface Reimbursement {
  id: string;
  title: string;
  description?: string;
  totalAmount: number;
  baseCurrency: string;
  status: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'processing' | 'paid' | 'cancelled';
  submittedAt?: string;
  createdAt: string;
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

const categoryIcons: Record<string, string> = {
  flight: '✈️',
  train: '🚄',
  hotel: '🏨',
  meal: '🍽️',
  taxi: '🚕',
  office_supplies: '📎',
  ai_token: '🤖',
  cloud_resource: '☁️',
  client_entertainment: '🤝',
  other: '📦',
};

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);

  // 从 API 获取报销列表
  useEffect(() => {
    const fetchReimbursements = async () => {
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
      } finally {
        setLoading(false);
      }
    };

    fetchReimbursements();
  }, [filter]);

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

  const filters = [
    { value: 'all', label: '全部' },
    { value: 'draft', label: '草稿' },
    { value: 'pending', label: '待审批' },
    { value: 'approved', label: '已批准' },
    { value: 'paid', label: '已付款' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
            我的报销
          </h2>
          <p style={{ color: '#6b7280' }}>管理和跟踪你的报销申请</p>
        </div>
        <Link
          href="/dashboard/reimbursements/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1.25rem',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: 'white',
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.875rem'
          }}
        >
          <span>+</span> 新建报销
        </Link>
      </div>

      {/* Stats Row - Clickable for filtering */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            backgroundColor: filter === 'all' ? '#eff6ff' : 'white',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            border: filter === 'all' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>全部报销</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{stats.total}</p>
        </button>
        <button
          onClick={() => setFilter('pending')}
          style={{
            backgroundColor: filter === 'pending' ? '#fef3c7' : 'white',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            border: filter === 'pending' ? '2px solid #d97706' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>待审批</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
        </button>
        <button
          onClick={() => setFilter('approved')}
          style={{
            backgroundColor: filter === 'approved' ? '#dcfce7' : 'white',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            border: filter === 'approved' ? '2px solid #16a34a' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>已批准</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{stats.approved}</p>
        </button>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>报销总额</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>¥{stats.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        padding: '1rem',
        border: '1px solid #e5e7eb',
        marginBottom: '1rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="🔍 搜索报销..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {filters.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: '0.5rem',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                backgroundColor: filter === item.value ? '#2563eb' : '#f3f4f6',
                color: filter === item.value ? 'white' : '#4b5563',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '3rem 2rem',
          textAlign: 'center'
        }}>
          <p style={{ color: '#6b7280' }}>加载中...</p>
        </div>
      )}

      {/* Reimbursement List */}
      {!loading && filteredReimbursements.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          {filteredReimbursements.map((reimbursement, index) => {
            const statusInfo = statusLabels[reimbursement.status] || statusLabels.draft;
            return (
              <Link
                key={reimbursement.id}
                href={`/dashboard/reimbursements/${reimbursement.id}`}
                style={{
                  display: 'block',
                  padding: '1rem 1.25rem',
                  borderBottom: index < filteredReimbursements.length - 1 ? '1px solid #e5e7eb' : 'none',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Icon - show first item category */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem'
                    }}>
                      {reimbursement.items?.[0]?.category
                        ? (categoryIcons[reimbursement.items[0].category] || '📄')
                        : '📄'}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}>
                        {reimbursement.title}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                        <span>{new Date(reimbursement.createdAt).toLocaleDateString('zh-CN')}</span>
                        <span>•</span>
                        <span>{reimbursement.items?.length || 0} 项费用</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      padding: '0.25rem 0.625rem',
                      borderRadius: '9999px',
                      backgroundColor: statusInfo.bgColor,
                      color: statusInfo.color
                    }}>
                      {statusInfo.label}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                      ¥{reimbursement.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredReimbursements.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '4rem 2rem',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            backgroundColor: '#f3f4f6',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '2rem'
          }}>
            📄
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
            {search ? '未找到匹配的报销记录' : '还没有报销记录'}
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            {search
              ? '请尝试其他搜索关键词'
              : '创建你的第一笔报销，可以通过 AI 助手上传票据自动识别，或手动填写报销信息'}
          </p>
          {!search && (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <Link
                href="/dashboard/chat"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                🤖 用 AI 助手创建
              </Link>
              <Link
                href="/dashboard/reimbursements/new"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                ✏️ 手动创建报销
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
