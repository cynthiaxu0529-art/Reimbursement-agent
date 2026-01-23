'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  submittedAt?: string;
  items: ReimbursementItem[];
  submitter?: {
    name: string;
    email: string;
  };
}

const categoryIcons: Record<string, string> = {
  flight: '✈️',
  train: '🚄',
  hotel: '🏨',
  meal: '🍽️',
  taxi: '🚕',
  other: '📦',
};

export default function ApprovalsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingApprovals, setPendingApprovals] = useState<Reimbursement[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // 获取待审批列表
  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        // 获取所有待审批的报销
        const pendingResponse = await fetch('/api/reimbursements?status=pending');
        const pendingResult = await pendingResponse.json();
        if (pendingResult.success) {
          setPendingApprovals(pendingResult.data || []);
        }

        // 获取审批历史（已批准或已拒绝的）
        const historyResponse = await fetch('/api/reimbursements?status=approved,rejected');
        const historyResult = await historyResponse.json();
        if (historyResult.success) {
          setApprovalHistory(historyResult.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovals();
  }, []);

  const handleApprove = async (id: string) => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', comment }),
      });
      const result = await response.json();
      if (result.success) {
        // 从待审批列表中移除
        const approved = pendingApprovals.find(a => a.id === id);
        if (approved) {
          approved.status = 'approved';
          setApprovalHistory([approved, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
        setShowApproveModal(null);
        setComment('');
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

  const handleReject = async (id: string) => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectReason: comment }),
      });
      const result = await response.json();
      if (result.success) {
        // 从待审批列表中移除
        const rejected = pendingApprovals.find(a => a.id === id);
        if (rejected) {
          rejected.status = 'rejected';
          setApprovalHistory([rejected, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
        setShowRejectModal(null);
        setComment('');
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

  // 统计
  const stats = {
    pending: pendingApprovals.length,
    approved: approvalHistory.filter(a => a.status === 'approved').length,
    pendingAmount: pendingApprovals.reduce((sum, a) => sum + a.totalAmount, 0),
  };

  const selectedApproval = showApproveModal
    ? pendingApprovals.find(a => a.id === showApproveModal)
    : showRejectModal
    ? pendingApprovals.find(a => a.id === showRejectModal)
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          审批管理
        </h2>
        <p style={{ color: '#6b7280' }}>审核团队成员的报销申请</p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>待审批</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#fef3c7',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem'
            }}>
              ⏳
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>已审批</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>{stats.approved}</p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#dcfce7',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem'
            }}>
              ✅
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>待审批金额</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2563eb' }}>
                ¥{stats.pendingAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#dbeafe',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem'
            }}>
              💰
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '0.5rem'
      }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'pending' ? '#f3e8ff' : 'transparent',
            color: activeTab === 'pending' ? '#7c3aed' : '#6b7280',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          待审批 ({stats.pending})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'history' ? '#f3e8ff' : 'transparent',
            color: activeTab === 'history' ? '#7c3aed' : '#6b7280',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          审批历史
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '3rem',
          textAlign: 'center'
        }}>
          <p style={{ color: '#6b7280' }}>加载中...</p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          {activeTab === 'pending' ? (
            pendingApprovals.length > 0 ? (
              <div>
                {pendingApprovals.map((approval, index) => (
                  <div
                    key={approval.id}
                    style={{
                      padding: '1.25rem',
                      borderBottom: index < pendingApprovals.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.25rem'
                      }}>
                        {approval.items?.[0]?.category
                          ? (categoryIcons[approval.items[0].category] || '📄')
                          : '📄'}
                      </div>
                      <div>
                        <Link
                          href={`/dashboard/reimbursements/${approval.id}`}
                          style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: '#111827',
                            textDecoration: 'none',
                            marginBottom: '0.25rem',
                            display: 'block'
                          }}
                        >
                          {approval.title}
                        </Link>
                        <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                          {approval.submitter?.name || '用户'} ·
                          {new Date(approval.createdAt).toLocaleDateString('zh-CN')} ·
                          {approval.items?.length || 0} 项费用
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                        ¥{approval.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => setShowRejectModal(approval.id)}
                          style={{
                            padding: '0.375rem 0.75rem',
                            backgroundColor: 'white',
                            color: '#dc2626',
                            border: '1px solid #dc2626',
                            borderRadius: '0.375rem',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                        >
                          拒绝
                        </button>
                        <button
                          onClick={() => setShowApproveModal(approval.id)}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                        >
                          批准
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  fontSize: '2rem'
                }}>
                  ✅
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                  没有待审批的报销
                </h3>
                <p style={{ color: '#6b7280' }}>
                  当团队成员提交报销申请后，将会在这里显示
                </p>
              </div>
            )
          ) : (
            approvalHistory.length > 0 ? (
              <div>
                {approvalHistory.map((approval, index) => (
                  <div
                    key={approval.id}
                    style={{
                      padding: '1.25rem',
                      borderBottom: index < approvalHistory.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.25rem'
                      }}>
                        {approval.items?.[0]?.category
                          ? (categoryIcons[approval.items[0].category] || '📄')
                          : '📄'}
                      </div>
                      <div>
                        <Link
                          href={`/dashboard/reimbursements/${approval.id}`}
                          style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            color: '#111827',
                            textDecoration: 'none',
                            marginBottom: '0.25rem',
                            display: 'block'
                          }}
                        >
                          {approval.title}
                        </Link>
                        <p style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                          {approval.submitter?.name || '用户'} ·
                          {new Date(approval.createdAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        padding: '0.25rem 0.625rem',
                        borderRadius: '9999px',
                        backgroundColor: approval.status === 'approved' ? '#dcfce7' : '#fee2e2',
                        color: approval.status === 'approved' ? '#16a34a' : '#dc2626'
                      }}>
                        {approval.status === 'approved' ? '已批准' : '已拒绝'}
                      </span>
                      <span style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                        ¥{approval.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  fontSize: '2rem'
                }}>
                  📋
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                  暂无审批记录
                </h3>
                <p style={{ color: '#6b7280' }}>
                  审批过的报销申请将会显示在这里
                </p>
              </div>
            )
          )}
        </div>
      )}

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
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              确定要批准 "{selectedApproval?.title}" 吗？
              金额: ¥{selectedApproval?.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem' }}>
                审批意见（可选）
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="输入审批意见..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  minHeight: '80px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowApproveModal(null); setComment(''); }}
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
                onClick={() => handleApprove(showApproveModal)}
                disabled={processing}
                style={{
                  padding: '0.5rem 1rem',
                  background: processing ? '#9ca3af' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
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
              拒绝 "{selectedApproval?.title}"，请填写拒绝原因
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
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
                onClick={() => { setShowRejectModal(null); setComment(''); }}
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
                onClick={() => handleReject(showRejectModal)}
                disabled={!comment || processing}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: (!comment || processing) ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
                  cursor: (!comment || processing) ? 'not-allowed' : 'pointer'
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
