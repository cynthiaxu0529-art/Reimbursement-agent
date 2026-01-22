'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Mock data - would come from API in real app
const mockReimbursement = {
  id: '1',
  title: '上海出差报销',
  status: 'pending',
  statusLabel: '待审批',
  createdAt: '2024-01-18',
  submittedAt: '2024-01-18',
  tripName: '上海客户拜访',
  tripId: 'trip1',
  totalAmount: 3895,
  currency: 'CNY',
  submitter: {
    name: '张三',
    email: 'zhangsan@company.com',
    avatar: 'Z'
  },
  approver: {
    name: '李四',
    email: 'lisi@company.com',
    avatar: 'L'
  },
  items: [
    {
      id: '1',
      category: 'flight',
      categoryLabel: '机票',
      categoryIcon: '✈️',
      description: '上海往返机票',
      amount: 1580,
      currency: 'CNY',
      date: '2024-01-15',
      location: '上海',
      receiptUrl: '/receipts/flight.jpg'
    },
    {
      id: '2',
      category: 'hotel',
      categoryLabel: '酒店住宿',
      categoryIcon: '🏨',
      description: '上海万豪酒店 2晚',
      amount: 1560,
      currency: 'CNY',
      date: '2024-01-15',
      location: '上海',
      receiptUrl: '/receipts/hotel.jpg'
    },
    {
      id: '3',
      category: 'taxi',
      categoryLabel: '交通',
      categoryIcon: '🚕',
      description: '机场往返打车',
      amount: 280,
      currency: 'CNY',
      date: '2024-01-15',
      location: '上海',
      receiptUrl: '/receipts/taxi.jpg'
    },
    {
      id: '4',
      category: 'meal',
      categoryLabel: '餐饮',
      categoryIcon: '🍽️',
      description: '客户工作餐',
      amount: 475,
      currency: 'CNY',
      date: '2024-01-16',
      location: '上海',
      receiptUrl: '/receipts/meal.jpg'
    }
  ],
  timeline: [
    { action: '提交报销', user: '张三', time: '2024-01-18 14:30', icon: '📝' },
    { action: '等待审批', user: '系统', time: '2024-01-18 14:30', icon: '⏳' }
  ]
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#f3f4f6', text: '#6b7280', label: '草稿' },
  pending: { bg: '#fef3c7', text: '#d97706', label: '待审批' },
  approved: { bg: '#dcfce7', text: '#16a34a', label: '已批准' },
  rejected: { bg: '#fee2e2', text: '#dc2626', label: '已拒绝' },
  paid: { bg: '#d1fae5', text: '#059669', label: '已付款' }
};

export default function ReimbursementDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // In real app, fetch data based on params.id
  const reimbursement = mockReimbursement;
  const status = statusColors[reimbursement.status];

  const handleApprove = () => {
    console.log('Approving reimbursement:', params.id);
    setShowApproveModal(false);
    router.push('/dashboard/reimbursements');
  };

  const handleReject = () => {
    console.log('Rejecting reimbursement:', params.id, 'Reason:', rejectReason);
    setShowRejectModal(false);
    router.push('/dashboard/reimbursements');
  };

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
            提交于 {reimbursement.submittedAt} · 关联行程: {reimbursement.tripName}
          </p>
        </div>

        {reimbursement.status === 'pending' && (
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
                  ¥{reimbursement.totalAmount.toLocaleString()}
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
                费用明细 ({reimbursement.items.length} 项)
              </h3>
            </div>
            <div>
              {reimbursement.items.map((item, index) => (
                <div
                  key={item.id}
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
                      {item.categoryIcon}
                    </div>
                    <div>
                      <p style={{ fontWeight: 500, color: '#111827', marginBottom: '0.125rem' }}>
                        {item.description}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {item.categoryLabel} · {item.date} · {item.location}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 600, color: '#111827' }}>
                      ¥{item.amount.toLocaleString()}
                    </p>
                    {item.receiptUrl && (
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        查看票据
                      </button>
                    )}
                  </div>
                </div>
              ))}
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
                  {reimbursement.submitter.avatar}
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                    {reimbursement.submitter.name}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>审批人</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  backgroundColor: '#9333ea',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}>
                  {reimbursement.approver.avatar}
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                    {reimbursement.approver.name}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>关联行程</p>
              <Link
                href={`/dashboard/trips/${reimbursement.tripId}`}
                style={{
                  fontSize: '0.875rem',
                  color: '#2563eb',
                  textDecoration: 'none'
                }}
              >
                {reimbursement.tripName} →
              </Link>
            </div>
          </div>

          {/* Timeline Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1.25rem'
          }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '1rem' }}>
              审批进度
            </h4>
            <div>
              {reimbursement.timeline.map((event, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginBottom: index < reimbursement.timeline.length - 1 ? '1rem' : 0,
                    position: 'relative'
                  }}
                >
                  {index < reimbursement.timeline.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      left: '12px',
                      top: '28px',
                      bottom: '-8px',
                      width: '2px',
                      backgroundColor: '#e5e7eb'
                    }} />
                  )}
                  <div style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    flexShrink: 0,
                    zIndex: 1
                  }}>
                    {event.icon}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                      {event.action}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {event.user} · {event.time}
                    </p>
                  </div>
                </div>
              ))}
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
              确定要批准这笔 ¥{reimbursement.totalAmount.toLocaleString()} 的报销申请吗？
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowApproveModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleApprove}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                确认批准
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
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: rejectReason ? '#dc2626' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: rejectReason ? 'pointer' : 'not-allowed'
                }}
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
