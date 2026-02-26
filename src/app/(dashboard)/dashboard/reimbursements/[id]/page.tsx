'use client';

import { useState, useEffect, use, useCallback } from 'react';
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
  receiptUrl?: string;
}

interface PayoutInfo {
  payoutId?: string;
  status?: string;
  approvalUrl?: string;
  txHash?: string;
  amountUSDC?: number;
  toAddress?: string;
  initiatedAt?: string;
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  submittedAt?: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
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
  rejectedAt?: string;
  rejectedBy?: string;
  rejectReason?: string;
  rejector?: {
    name: string;
    email: string;
    role?: string;
  };
  timeline?: Array<{
    action: string;
    user: string;
    time: string;
  }>;
  aiSuggestions?: any[];
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#f3f4f6', text: '#6b7280', label: '草稿' },
  pending: { bg: '#fef3c7', text: '#d97706', label: '待审批' },
  under_review: { bg: '#dbeafe', text: '#2563eb', label: '审核中' },
  approved: { bg: '#dcfce7', text: '#16a34a', label: '已批准' },
  rejected: { bg: '#fee2e2', text: '#dc2626', label: '已拒绝' },
  processing: { bg: '#ede9fe', text: '#7c3aed', label: '打款处理中' },
  paid: { bg: '#d1fae5', text: '#059669', label: '已付款' },
  cancelled: { bg: '#f3f4f6', text: '#9ca3af', label: '已取消' },
};

const payoutStatusLabels: Record<string, { label: string; color: string }> = {
  pending_authorization: { label: '等待审批', color: '#d97706' },
  authorized: { label: '已授权', color: '#2563eb' },
  signed: { label: '已签名', color: '#7c3aed' },
  broadcasting: { label: '广播中', color: '#7c3aed' },
  succeeded: { label: '打款成功', color: '#059669' },
  failed: { label: '打款失败', color: '#dc2626' },
  expired: { label: '已过期', color: '#9ca3af' },
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

export default function ReimbursementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [reimbursement, setReimbursement] = useState<Reimbursement | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [itinerary, setItinerary] = useState<any>(null);
  const [itineraryLoading, setItineraryLoading] = useState(false);

  // 从 API 获取报销详情
  useEffect(() => {
    const fetchReimbursement = async () => {
      try {
        const response = await fetch(`/api/reimbursements/${id}`);
        const result = await response.json();
        if (result.success && result.data) {
          setReimbursement(result.data);
          // 从 aiSuggestions 中提取 payout 信息
          const suggestions = result.data.aiSuggestions || [];
          const latestPayout = suggestions
            .filter((s: any) => s.type === 'fluxa_payout_initiated')
            .pop();
          if (latestPayout) {
            setPayoutInfo({
              payoutId: latestPayout.payoutId,
              status: latestPayout.status,
              approvalUrl: latestPayout.approvalUrl,
              amountUSDC: latestPayout.amountUSDC,
              initiatedAt: latestPayout.initiatedAt,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch reimbursement:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchUserProfile = async () => {
      try {
        const response = await fetch('/api/settings/profile');
        const result = await response.json();
        if (result.success && result.data) {
          setUserRole(result.data.role || 'employee');
          setCurrentUserId(result.data.id || '');
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      }
    };

    fetchReimbursement();
    fetchUserProfile();
  }, [id]);

  // 判断是否是报销单所有者
  useEffect(() => {
    if (reimbursement && currentUserId) {
      // 检查报销单的 userId 是否与当前用户 ID 匹配
      const reimbursementUserId = (reimbursement as any).userId;
      setIsOwner(reimbursementUserId === currentUserId);
    }
  }, [reimbursement, currentUserId]);

  // 获取关联的行程单
  useEffect(() => {
    const fetchItinerary = async () => {
      setItineraryLoading(true);
      try {
        const response = await fetch(`/api/trip-itineraries?reimbursementId=${id}`);
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
          setItinerary(result.data[0]);
        }
      } catch (error) {
        console.error('Failed to fetch itinerary:', error);
      } finally {
        setItineraryLoading(false);
      }
    };
    fetchItinerary();
  }, [id]);

  // 重新编辑（将状态改为草稿）
  const handleReEdit = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      const result = await response.json();
      if (result.success) {
        // 跳转到编辑页面
        router.push(`/dashboard/reimbursements/${id}/edit`);
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Re-edit error:', error);
      alert('操作失败');
    } finally {
      setProcessing(false);
    }
  };

  // 删除报销单
  const handleDelete = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        router.push('/dashboard/reimbursements');
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('删除失败');
    } finally {
      setProcessing(false);
      setShowDeleteModal(false);
    }
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
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
      const response = await fetch(`/api/reimbursements/${id}`, {
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

  // 发起 Fluxa Payout
  const handleInitiatePayout = async () => {
    setPayoutLoading(true);
    try {
      const response = await fetch('/api/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursementId: id }),
      });
      const result = await response.json();
      if (result.success) {
        setPayoutInfo({
          payoutId: result.payoutId,
          status: result.status,
          approvalUrl: result.approvalUrl,
          amountUSDC: result.amountUSDC,
          toAddress: result.toAddress,
        });
        setShowPayoutModal(false);
        // 刷新报销单信息
        const refreshResponse = await fetch(`/api/reimbursements/${id}`);
        const refreshResult = await refreshResponse.json();
        if (refreshResult.success && refreshResult.data) {
          setReimbursement(refreshResult.data);
        }
      } else {
        alert(result.message || result.error?.message || '发起打款失败');
      }
    } catch (error) {
      console.error('Payout error:', error);
      alert('发起打款失败');
    } finally {
      setPayoutLoading(false);
    }
  };

  // 查询 Payout 状态
  const handleCheckPayoutStatus = async () => {
    if (!payoutInfo?.payoutId) return;
    setPayoutLoading(true);
    try {
      const response = await fetch(`/api/payments/status/${payoutInfo.payoutId}`);
      const result = await response.json();
      if (result.success) {
        setPayoutInfo({
          ...payoutInfo,
          status: result.status,
          txHash: result.txHash,
          approvalUrl: result.approvalUrl,
        });
        // 如果状态变为成功或失败，刷新报销单
        if (result.isTerminal) {
          const refreshResponse = await fetch(`/api/reimbursements/${id}`);
          const refreshResult = await refreshResponse.json();
          if (refreshResult.success && refreshResult.data) {
            setReimbursement(refreshResult.data);
          }
        }
      }
    } catch (error) {
      console.error('Check status error:', error);
    } finally {
      setPayoutLoading(false);
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
  const isApproved = reimbursement.status === 'approved';
  const isRejected = reimbursement.status === 'rejected';
  const isDraft = reimbursement.status === 'draft';
  const isProcessing = reimbursement.status === 'processing';
  const canInitiatePayout = isApproved && ['finance', 'admin', 'super_admin'].includes(userRole);
  const canEdit = isOwner && (isRejected || isDraft);
  const canDelete = isOwner && (isRejected || isDraft);

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

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* 被驳回或草稿状态：显示编辑和删除按钮 */}
          {canEdit && (
            <button
              onClick={handleReEdit}
              disabled={processing}
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.7 : 1
              }}
            >
              {isRejected ? '修改并重新提交' : '编辑'}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              disabled={processing}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'white',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: processing ? 'not-allowed' : 'pointer',
                opacity: processing ? 0.7 : 1
              }}
            >
              删除
            </button>
          )}
          {/* 待审批状态：显示审批按钮 */}
          {isPending && (
            <>
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
            </>
          )}
          {canInitiatePayout && (
            <button
              onClick={() => setShowPayoutModal(true)}
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              💳 发起打款
            </button>
          )}
        </div>
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
                {reimbursement.totalAmountInBaseCurrency && (
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    ≈ ${reimbursement.totalAmountInBaseCurrency.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                  </p>
                )}
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

          {/* Rejection Info Card - 只在被驳回状态显示 */}
          {isRejected && (
            <div style={{
              backgroundColor: '#fef2f2',
              borderRadius: '0.75rem',
              border: '1px solid #fecaca',
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#fee2e2',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0
                }}>
                  ❌
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.5rem' }}>
                    报销申请被驳回
                  </h3>
                  {reimbursement.rejectReason && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>驳回原因：</p>
                      <p style={{ fontSize: '0.875rem', color: '#111827', backgroundColor: 'white', padding: '0.75rem', borderRadius: '0.5rem' }}>
                        {reimbursement.rejectReason}
                      </p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#6b7280' }}>
                    {reimbursement.rejectedAt && (
                      <span>驳回时间：{new Date(reimbursement.rejectedAt).toLocaleString('zh-CN')}</span>
                    )}
                    {reimbursement.rejector?.name && (
                      <span>驳回人：{reimbursement.rejector.name}</span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.75rem' }}>
                    您可以修改后重新提交，或者删除此报销申请。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payout Status Card - 只在处理中或有 payout 信息时显示 */}
          {(isProcessing || payoutInfo) && (
            <div style={{
              backgroundColor: '#f5f3ff',
              borderRadius: '0.75rem',
              border: '1px solid #c4b5fd',
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#5b21b6' }}>
                  💳 Fluxa 打款状态
                </h3>
                {payoutInfo?.payoutId && (
                  <button
                    onClick={handleCheckPayoutStatus}
                    disabled={payoutLoading}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: 'white',
                      color: '#5b21b6',
                      border: '1px solid #c4b5fd',
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      cursor: payoutLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {payoutLoading ? '查询中...' : '刷新状态'}
                  </button>
                )}
              </div>

              {payoutInfo && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {/* 状态 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '80px' }}>状态:</span>
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      backgroundColor: 'white',
                      color: payoutStatusLabels[payoutInfo.status || '']?.color || '#6b7280'
                    }}>
                      {payoutStatusLabels[payoutInfo.status || '']?.label || payoutInfo.status}
                    </span>
                  </div>

                  {/* 金额 */}
                  {payoutInfo.amountUSDC && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '80px' }}>打款金额:</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
                        ${payoutInfo.amountUSDC.toFixed(2)} USDC
                      </span>
                    </div>
                  )}

                  {/* 收款地址 */}
                  {payoutInfo.toAddress && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '80px' }}>收款地址:</span>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#111827' }}>
                        {payoutInfo.toAddress.slice(0, 6)}...{payoutInfo.toAddress.slice(-4)}
                      </span>
                    </div>
                  )}

                  {/* 交易哈希 */}
                  {payoutInfo.txHash && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '80px' }}>交易哈希:</span>
                      <a
                        href={`https://basescan.org/tx/${payoutInfo.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#2563eb', textDecoration: 'none' }}
                      >
                        {payoutInfo.txHash.slice(0, 10)}...{payoutInfo.txHash.slice(-8)}
                      </a>
                    </div>
                  )}

                  {/* 审批链接 - 仅在等待审批时显示 */}
                  {payoutInfo.approvalUrl && payoutInfo.status === 'pending_authorization' && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <a
                        href={payoutInfo.approvalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 1rem',
                          background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                          color: 'white',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          textDecoration: 'none'
                        }}
                      >
                        🔐 前往钱包审批
                      </a>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                        请点击上方按钮在 Fluxa 钱包中完成打款审批
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {/* Receipt 缩略图 */}
                      {item.receiptUrl && (
                        <button
                          onClick={() => setPreviewImage(item.receiptUrl || null)}
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            padding: 0,
                            background: '#f9fafb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="点击查看大图"
                        >
                          <img
                            src={item.receiptUrl}
                            alt="票据"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size: 1.25rem;">📄</span>';
                            }}
                          />
                        </button>
                      )}
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 600, color: '#111827' }}>
                          ¥{Number(item.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
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

          {/* Trip Itinerary Section */}
          {itinerary && itinerary.items && itinerary.items.length > 0 && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              marginTop: '1rem',
            }}>
              <div style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🗺️</span>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af' }}>
                    差旅行程单
                  </h3>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    backgroundColor: itinerary.status === 'confirmed' ? '#dcfce7' : '#fef3c7',
                    color: itinerary.status === 'confirmed' ? '#166534' : '#92400e',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}>
                    {itinerary.status === 'confirmed' ? '✓ 已确认' :
                     itinerary.status === 'modified' ? '已修改' : '草稿'}
                  </span>
                </div>
              </div>
              <div style={{ padding: '1.25rem' }}>
                {/* Itinerary header */}
                <div style={{
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                    {itinerary.title}
                  </h4>
                  {itinerary.purpose && (
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>目的：{itinerary.purpose}</p>
                  )}
                  {itinerary.destinations && itinerary.destinations.length > 0 && (
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      目的地：{itinerary.destinations.join(' → ')}
                    </p>
                  )}
                </div>

                {/* Itinerary items grouped by date */}
                {(() => {
                  const grouped = (itinerary.items || []).reduce((groups: any, item: any) => {
                    const date = (item.date || '').split('T')[0] || '未知日期';
                    if (!groups[date]) groups[date] = [];
                    groups[date].push(item);
                    return groups;
                  }, {} as Record<string, any[]>);

                  const typeIcons: Record<string, string> = {
                    transport: '🚆', hotel: '🏨', meal: '🍽️', meeting: '📋', other: '📌',
                  };
                  const catIcons: Record<string, string> = {
                    flight: '✈️', train: '🚄', hotel: '🏨', meal: '🍽️', taxi: '🚕',
                  };

                  const formatDate = (dateStr: string) => {
                    try {
                      const d = new Date(dateStr);
                      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                      return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
                    } catch { return dateStr; }
                  };

                  return Object.entries(grouped)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, items]: [string, any[]]) => (
                      <div key={date} style={{ marginBottom: '12px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '6px',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#2563eb',
                          }} />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>
                            {formatDate(date)}
                          </span>
                        </div>
                        <div style={{
                          marginLeft: '4px',
                          borderLeft: '2px solid #e5e7eb',
                          paddingLeft: '16px',
                        }}>
                          {items
                            .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
                            .map((item: any, idx: number) => (
                              <div key={idx} style={{
                                padding: '8px 12px',
                                backgroundColor: '#fafafa',
                                borderRadius: '6px',
                                marginBottom: '6px',
                                border: '1px solid #f3f4f6',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                  <span style={{ fontSize: '14px' }}>
                                    {item.category ? (catIcons[item.category] || typeIcons[item.type] || '📌')
                                      : (typeIcons[item.type] || '📌')}
                                  </span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {item.time && (
                                        <span style={{
                                          fontSize: '11px',
                                          color: '#6b7280',
                                          backgroundColor: '#f3f4f6',
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                        }}>
                                          {item.time}
                                        </span>
                                      )}
                                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                                        {item.title}
                                      </span>
                                    </div>
                                    {item.description && (
                                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                        {item.description}
                                      </p>
                                    )}
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
                                      {item.amount && (
                                        <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 500 }}>
                                          💰 {item.currency || 'CNY'} {parseFloat(item.amount).toLocaleString()}
                                        </span>
                                      )}
                                      {item.receiptUrl && (
                                        <span style={{ fontSize: '11px', color: '#16a34a' }}>
                                          🧾 已关联凭证
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ));
                })()}
              </div>
            </div>
          )}
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
                 reimbursement.status === 'processing' ? '💳' :
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
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
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#dc2626' }}>
              确认删除
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              确定要删除这笔报销申请吗？此操作无法撤销。
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
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
                onClick={handleDelete}
                disabled={processing}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: processing ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                {processing ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Modal */}
      {showPayoutModal && (
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
            maxWidth: '450px'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              💳 发起 Fluxa 打款
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              将通过 Fluxa 钱包向员工发起 USDC 打款
            </p>

            <div style={{
              backgroundColor: '#f5f3ff',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#6b7280' }}>报销金额:</span>
                <span style={{ fontWeight: 500 }}>¥{reimbursement.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>打款金额:</span>
                <span style={{ fontWeight: 600, color: '#5b21b6' }}>
                  ≈ ${(reimbursement.totalAmountInBaseCurrency || reimbursement.totalAmount).toFixed(2)} USDC
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>
              发起后，您将获得一个审批链接，需要在 Fluxa 钱包中完成最终审批才能打款。
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPayoutModal(false)}
                disabled={payoutLoading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: payoutLoading ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleInitiatePayout}
                disabled={payoutLoading}
                style={{
                  padding: '0.5rem 1rem',
                  background: payoutLoading ? '#9ca3af' : 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: payoutLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {payoutLoading ? '处理中...' : '确认发起打款'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            cursor: 'pointer',
            padding: '2rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: 'white',
                fontSize: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
              }}
            >
              x
            </button>
            <img
              src={previewImage}
              alt="票据大图"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
