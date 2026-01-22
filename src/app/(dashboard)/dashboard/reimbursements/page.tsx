'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // 空数据状态 - 实际数据将从API获取
  const reimbursements: any[] = [];

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

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>全部报销</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>0</p>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>待审批</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>0</p>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>已批准</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>0</p>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>报销总额</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>¥0</p>
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

      {/* Empty State */}
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
          还没有报销记录
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
          创建你的第一笔报销，可以通过 AI 助手上传票据自动识别，或手动填写报销信息
        </p>
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
      </div>
    </div>
  );
}
