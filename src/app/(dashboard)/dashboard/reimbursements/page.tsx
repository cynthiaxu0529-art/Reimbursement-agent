'use client';

import { useState } from 'react';
import Link from 'next/link';

// 模拟数据
const mockReimbursements = [
  {
    id: '1',
    title: '上海出差报销',
    amount: 3895,
    status: 'pending',
    date: '2024-01-18',
    items: 4,
    trip: '上海客户拜访',
  },
  {
    id: '2',
    title: '办公用品采购',
    amount: 560,
    status: 'approved',
    date: '2024-01-15',
    items: 2,
  },
  {
    id: '3',
    title: '客户招待费用',
    amount: 1280,
    status: 'paid',
    date: '2024-01-12',
    items: 1,
  },
  {
    id: '4',
    title: '北京培训差旅',
    amount: 5620,
    status: 'draft',
    date: '2024-01-10',
    items: 6,
    trip: '北京技术培训',
  },
  {
    id: '5',
    title: 'API 费用报销',
    amount: 2400,
    status: 'rejected',
    date: '2024-01-08',
    items: 1,
  },
];

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: '草稿', bg: '#f3f4f6', text: '#4b5563' },
  pending: { label: '待审批', bg: '#fef3c7', text: '#d97706' },
  under_review: { label: '审批中', bg: '#dbeafe', text: '#2563eb' },
  approved: { label: '已批准', bg: '#dcfce7', text: '#16a34a' },
  paid: { label: '已付款', bg: '#d1fae5', text: '#059669' },
  rejected: { label: '已拒绝', bg: '#fee2e2', text: '#dc2626' },
};

const filters = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已批准' },
  { value: 'paid', label: '已付款' },
];

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredReimbursements = mockReimbursements.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Calculate stats
  const stats = {
    total: mockReimbursements.length,
    pending: mockReimbursements.filter(r => r.status === 'pending').length,
    totalAmount: mockReimbursements.reduce((sum, r) => sum + r.amount, 0),
  };

  return (
    <div>
      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>总报销单</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{stats.total}</p>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>待审批</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>总金额</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>¥{stats.totalAmount.toLocaleString()}</p>
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

      {/* Reimbursement List */}
      <div>
        {filteredReimbursements.map((reimbursement) => (
          <Link
            key={reimbursement.id}
            href={`/dashboard/reimbursements/${reimbursement.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid #e5e7eb',
              marginBottom: '0.75rem',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                      {reimbursement.title}
                    </span>
                    <span style={{
                      padding: '0.25rem 0.625rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      backgroundColor: statusConfig[reimbursement.status].bg,
                      color: statusConfig[reimbursement.status].text,
                    }}>
                      {statusConfig[reimbursement.status].label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    <span>📅 {reimbursement.date}</span>
                    <span>📋 {reimbursement.items} 项费用</span>
                    {reimbursement.trip && (
                      <span>✈️ {reimbursement.trip}</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                    ¥{reimbursement.amount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {filteredReimbursements.length === 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '3rem',
            border: '1px solid #e5e7eb',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>没有找到报销记录</p>
            <Link
              href="/dashboard/reimbursements/new"
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              创建第一个报销
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
