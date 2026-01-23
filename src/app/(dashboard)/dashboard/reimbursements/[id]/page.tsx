'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  location?: string;
  vendor?: string;
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  submittedAt?: string;
  totalAmount: number;
  baseCurrency: string;
  tripId?: string;
  tripName?: string;
  items: ReimbursementItem[];
  submitter?: {
    name: string;
    email: string;
  };
  approver?: {
    name: string;
    email: string;
  };
  timeline?: Array<{
    action: string;
    user: string;
    time: string;
  }>;
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#f3f4f6', text: '#6b7280', label: '草稿' },
  pending: { bg: '#fef3c7', text: '#d97706', label: '待审批' },
  under_review: { bg: '#dbeafe', text: '#2563eb', label: '审核中' },
  approved: { bg: '#dcfce7', text: '#16a34a', label: '已批准' },
  rejected: { bg: '#fee2e2', text: '#dc2626', label: '已拒绝' },
  processing: { bg: '#ede9fe', text: '#7c3aed', label: '处理中' },
  paid: { bg: '#d1fae5', text: '#059669', label: '已付款' },
  cancelled: { bg: '#f3f4f6', text: '#9ca3af', label: '已取消' },
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

const categoryLabels: Record<string, string> = {
  flight: '机票',
  train: '火车票',
  hotel: '酒店住宿',
  meal: '餐饮',
  taxi: '交通',
  office_supplies: '办公用品',
  ai_token: 'AI 服务',
  cloud_resource: '云资源',
  client_entertainment: '客户招待',
  other: '其他',
};

export default function ReimbursementDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [reimbursement, setReimbursement] = useState<Reimbursement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // 从 API 获取报销详情
  useEffect(() => {
    const fetchReimbursement = async () => {
      try {
        const response = await fetch(`/api/reimbursements/${params.id}`);
        const result = await response.json();
        if (result.success && result.data) {
          setReimbursement(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch reimbursement:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReimbursement();
  }, [params.id]);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const result = await response.json();
      if (result.success) {
        setShowApproveModal(false);
        router.push('/dashboard/approvals');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('操作失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectReason }),
      });
      const result = await response.json();
      if (result.success) {
        setShowRejectModal(false);
        router.push('/dashboard/approvals');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('操作失败');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>加载中...</p>
      </div>
    );
  }

  if (!reimbursement) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>报销单不存在或已被删除</p>
        <Link
          href="/dashboard/reimbursements"
          style={{
            display: 'inline-block',
            marginTop: '1rem',
            color: '#2563eb',
            textDecoration: 'none'
          }}
        >
          返回报销列表
        </Link>
      </div>
    );
  }

  const status = statusColors[reimbursement.status] || statusColors.draft;
  const isPending = reimbursement.status === 'pending' || reimbursement.status === 'under_review';

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Link
          href="/dashboard/reimbursements"
          style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          我的报销
        </Link>
        <span style={{ color: '#9ca3af' }}>/</span>
        <span style={{ color: '#111827', fontSize: '0.875rem' }}>{reimbursement.title}</span>
      </div>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
              {reimbursement.title}
            </h1>
            <span style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 500,
              backgroundColor: status.bg,
              color: status.text
            }}>
              {status.label}
            </span>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            提交于 {new Date(reimbursement.createdAt).toLocaleDateString('zh-CN')}
            {reimbursement.tripName && ` · 关联行程: ${reimbursement.tripName}`}
          </p>
        </div>

        {isPending && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowRejectModal(true)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'white',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              拒绝
            </button>
            <button
              onClick={() => setShowApproveModal(true)}
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              批准
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
        {/* Main Content */}
        <div>
          {/* Summary Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>报销总金额</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#111827' }}>
                  ¥{reimbursement.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div style={{
                width: '64px',
                height: '64px',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                borderRadius: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem'
              }}>
                💰
              </div>
            </div>
          </div>

          {/* Expense Items */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                费用明细 ({reimbursement.items?.length || 0} 项)
              </h3>
            </div>
            <div>
              {reimbursement.items && reimbursement.items.length > 0 ? (
                reimbursement.items.map((item, index) => (
                  <div
                    key={item.id || index}
                    style={{
                      padding: '1rem 1.25rem',
                      borderBottom: index < reimbursement.items.length - 1 ? '1px solid #f3f4f6' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                        {categoryIcons[item.category] || '📦'}
                      </div>
                      <div>
                        <p style={{ fontWeight: 500, color: '#111827', marginBottom: '0.125rem' }}>
                          {item.description || item.vendor || '费用项'}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {categoryLabels[item.category] || item.category}
                          {item.date && ` · ${new Date(item.date).toLocaleDateString('zh-CN')}`}
                          {item.location && ` · ${item.location}`}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 600, color: '#111827' }}>
                        ¥{Number(item.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                  暂无费用明细
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Info Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1.25rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>
              报销信息
            </h4>

            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>提交人</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  backgroundColor: '#2563eb',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}>
                  {reimbursement.submitter?.name?.[0] || 'U'}
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                    {reimbursement.submitter?.name || '当前用户'}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>报销ID</p>
              <p style={{ fontSize: '0.875rem', color: '#111827', fontFamily: 'monospace' }}>
                {reimbursement.id}
              </p>
            </div>

            <div>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>创建时间</p>
              <p style={{ fontSize: '0.875rem', color: '#111827' }}>
                {new Date(reimbursement.createdAt).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>

          {/* Status Timeline */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1.25rem'
          }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>
              状态
            </h4>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              backgroundColor: status.bg,
              borderRadius: '0.5rem'
            }}>
              <span style={{ fontSize: '1.25rem' }}>
                {reimbursement.status === 'pending' ? '⏳' :
                 reimbursement.status === 'approved' ? '✅' :
                 reimbursement.status === 'rejected' ? '❌' :
                 reimbursement.status === 'paid' ? '💰' : '📄'}
              </span>
              <span style={{ fontWeight: 500, color: status.text }}>
                {status.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            width: '100%',
            maxWidth: '400px'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              确认批准
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              确定要批准这笔 ¥{reimbursement.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 的报销申请吗？
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApproveModal(false)}
                disabled={processing}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleApprove}
                disabled={processing}
                style={{
                  padding: '0.5rem 1rem',
                  background: processing ? '#9ca3af' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                {processing ? '处理中...' : '确认批准'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            width: '100%',
            maxWidth: '400px'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              拒绝报销
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              请填写拒绝原因
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例如：发票信息不完整，请补充..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                minHeight: '100px',
                resize: 'vertical',
                boxSizing: 'border-box',
                marginBottom: '1rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRejectModal(false)}
                disabled={processing}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason || processing}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: (!rejectReason || processing) ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: (!rejectReason || processing) ? 'not-allowed' : 'pointer'
                }}
              >
                {processing ? '处理中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
