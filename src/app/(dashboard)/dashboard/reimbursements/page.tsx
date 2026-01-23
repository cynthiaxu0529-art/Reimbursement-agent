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
  vendor?: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Reimbursement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  // 获取详情
  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      return;
    }

    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${selectedId}`);
        const result = await response.json();
        if (result.success) {
          setDetailData(result.data);
        } else {
          setDetailData(null);
        }
      } catch (error) {
        console.error('Failed to fetch detail:', error);
        setDetailData(null);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedId]);

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

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
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
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
            gap: '12px',
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '12px',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
          }}>
            <div>报销说明</div>
            <div>类别</div>
            <div>提交日期</div>
            <div>状态</div>
            <div style={{ textAlign: 'right' }}>金额</div>
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
              const mainCategory = item.items?.[0]?.category || 'other';
              const categoryInfo = categoryLabels[mainCategory] || categoryLabels.other;
              const isSelected = selectedId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    gap: '12px',
                    padding: '14px 16px',
                    borderBottom: '1px solid #e5e7eb',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#eff6ff' : 'white',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      backgroundColor: isSelected ? '#dbeafe' : '#f3f4f6',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                    }}>
                      {categoryInfo.icon}
                    </div>
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
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '13px',
                      color: '#374151',
                      padding: '4px 8px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '4px',
                    }}>
                      {categoryInfo.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#6b7280' }}>
                    {formatDate(item.submittedAt || item.createdAt)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
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
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                  }}>
                    ¥{item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedId && (
        <div style={{
          width: '400px',
          flexShrink: 0,
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Panel Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f9fafb',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>报销详情</h3>
            <button
              onClick={() => setSelectedId(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px',
              }}
            >
              ×
            </button>
          </div>

          {/* Panel Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
            {detailLoading && (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
                加载中...
              </div>
            )}

            {!detailLoading && !detailData && (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
                无法加载详情
              </div>
            )}

            {!detailLoading && detailData && (
              <>
                {/* Title & Status */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', flex: 1 }}>
                      {detailData.title}
                    </h2>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      backgroundColor: statusLabels[detailData.status]?.bgColor || '#f3f4f6',
                      color: statusLabels[detailData.status]?.color || '#6b7280',
                      flexShrink: 0,
                      marginLeft: '12px',
                    }}>
                      {statusLabels[detailData.status]?.label || detailData.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#6b7280' }}>
                    提交于 {formatFullDate(detailData.submittedAt || detailData.createdAt)}
                  </p>
                </div>

                {/* Amount */}
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                }}>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>报销金额</p>
                  <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>
                    ¥{detailData.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                {/* Line Items */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                    费用明细 ({detailData.items?.length || 0})
                  </h4>
                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}>
                    {detailData.items?.map((item, index) => {
                      const catInfo = categoryLabels[item.category] || categoryLabels.other;
                      return (
                        <div
                          key={item.id}
                          style={{
                            padding: '12px',
                            borderBottom: index < (detailData.items?.length || 0) - 1 ? '1px solid #e5e7eb' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          }}
                        >
                          <div style={{
                            width: '32px',
                            height: '32px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                          }}>
                            {catInfo.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: '13px',
                              fontWeight: 500,
                              color: '#111827',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {item.description || catInfo.label}
                            </p>
                            <p style={{ fontSize: '11px', color: '#6b7280' }}>
                              {catInfo.label} · {formatDate(item.date)}
                            </p>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                            ¥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reject Reason */}
                {detailData.status === 'rejected' && detailData.rejectReason && (
                  <div style={{
                    backgroundColor: '#fee2e2',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '20px',
                  }}>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#dc2626', marginBottom: '4px' }}>
                      拒绝原因
                    </p>
                    <p style={{ fontSize: '13px', color: '#991b1b' }}>
                      {detailData.rejectReason}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  {detailData.status === 'draft' && (
                    <>
                      <Link
                        href={`/dashboard/reimbursements/${detailData.id}/edit`}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '10px 16px',
                          backgroundColor: 'white',
                          color: '#2563eb',
                          border: '1px solid #2563eb',
                          borderRadius: '8px',
                          textDecoration: 'none',
                          fontSize: '14px',
                          fontWeight: 500,
                        }}
                      >
                        编辑
                      </Link>
                      <button
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        提交审批
                      </button>
                    </>
                  )}
                  {(detailData.status === 'pending' || detailData.status === 'under_review') && (
                    <div style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#fef3c7',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '13px', color: '#92400e' }}>
                        等待审批中...
                      </p>
                    </div>
                  )}
                  {detailData.status === 'approved' && (
                    <div style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#dcfce7',
                      borderRadius: '8px',
                      textAlign: 'center',
                    }}>
                      <p style={{ fontSize: '13px', color: '#166534' }}>
                        已批准，等待付款
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
