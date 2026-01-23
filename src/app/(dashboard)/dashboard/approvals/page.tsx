'use client';

import { useState, useEffect } from 'react';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  receiptUrl?: string;
  vendor?: string;
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

const statusLabels: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '待审批', color: '#d97706', bgColor: '#fef3c7' },
  approved: { label: '已批准', color: '#16a34a', bgColor: '#dcfce7' },
  rejected: { label: '已拒绝', color: '#dc2626', bgColor: '#fee2e2' },
};

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingApprovals, setPendingApprovals] = useState<Reimbursement[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Reimbursement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 获取待审批列表
  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const pendingResponse = await fetch('/api/reimbursements?status=pending&role=approver');
        const pendingResult = await pendingResponse.json();
        if (pendingResult.success) {
          setPendingApprovals(pendingResult.data || []);
        }

        const historyResponse = await fetch('/api/reimbursements?status=approved,rejected&role=approver');
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

  // 获取详情 - 优先使用列表数据
  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      return;
    }

    // 先从列表中获取基本数据
    const currentList = activeTab === 'pending' ? pendingApprovals : approvalHistory;
    const listItem = currentList.find(r => r.id === selectedId);
    if (listItem) {
      setDetailData(listItem);
    }

    // 然后从 API 获取完整数据
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${selectedId}`);
        const result = await response.json();
        if (result.success && result.data) {
          setDetailData(result.data);
        }
        // 如果 API 失败但列表有数据，保持列表数据
      } catch (error) {
        console.error('Failed to fetch detail:', error);
        // 保持列表数据作为 fallback
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedId, pendingApprovals, approvalHistory, activeTab]);

  const handleApprove = async () => {
    if (!selectedId) return;
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', comment }),
      });
      const result = await response.json();
      if (result.success) {
        const approved = pendingApprovals.find(a => a.id === selectedId);
        if (approved) {
          approved.status = 'approved';
          setApprovalHistory([approved, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== selectedId));
        setSelectedId(null);
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

  const handleReject = async () => {
    if (!selectedId || !comment) return;
    setProcessing(true);
    try {
      const response = await fetch(`/api/reimbursements/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectReason: comment }),
      });
      const result = await response.json();
      if (result.success) {
        const rejected = pendingApprovals.find(a => a.id === selectedId);
        if (rejected) {
          rejected.status = 'rejected';
          setApprovalHistory([rejected, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== selectedId));
        setSelectedId(null);
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

  const stats = {
    pending: pendingApprovals.length,
    approved: approvalHistory.filter(a => a.status === 'approved').length,
    pendingAmount: pendingApprovals.reduce((sum, a) => sum + a.totalAmount, 0),
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const formatFullDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const currentList = activeTab === 'pending' ? pendingApprovals : approvalHistory;

  return (
    <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 140px)' }}>
      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
            审批管理
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>审核团队成员的报销申请</p>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>待审批</p>
                <p style={{ fontSize: '24px', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                backgroundColor: '#fef3c7',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                ⏳
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>已审批</p>
                <p style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{stats.approved}</p>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                backgroundColor: '#dcfce7',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                ✅
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>待审批金额</p>
                <p style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>
                  ¥{stats.pendingAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div style={{
                width: '44px',
                height: '44px',
                backgroundColor: '#dbeafe',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                💰
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
        }}>
          <button
            onClick={() => { setActiveTab('pending'); setSelectedId(null); }}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'pending' ? '#7c3aed' : 'white',
              color: activeTab === 'pending' ? 'white' : '#6b7280',
              border: activeTab === 'pending' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            待审批 ({stats.pending})
          </button>
          <button
            onClick={() => { setActiveTab('history'); setSelectedId(null); }}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'history' ? '#7c3aed' : 'white',
              color: activeTab === 'history' ? 'white' : '#6b7280',
              border: activeTab === 'history' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            审批历史
          </button>
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
            <div>申请人</div>
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

            {!loading && currentList.length === 0 && (
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
                  {activeTab === 'pending' ? '✅' : '📋'}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                  {activeTab === 'pending' ? '没有待审批的报销' : '暂无审批记录'}
                </h3>
                <p style={{ color: '#6b7280', fontSize: '14px' }}>
                  {activeTab === 'pending'
                    ? '当团队成员提交报销申请后，将会在这里显示'
                    : '审批过的报销申请将会显示在这里'}
                </p>
              </div>
            )}

            {!loading && currentList.map((item) => {
              const mainCategory = item.items?.[0]?.category || 'other';
              const categoryInfo = categoryLabels[mainCategory] || categoryLabels.other;
              const statusInfo = statusLabels[item.status] || statusLabels.pending;
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
                    backgroundColor: isSelected ? '#f3e8ff' : 'white',
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
                      backgroundColor: isSelected ? '#e9d5ff' : '#f3f4f6',
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
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#374151' }}>
                    {item.submitter?.name || '用户'}
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
            {detailLoading && !detailData && (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
                加载中...
              </div>
            )}

            {!detailLoading && !detailData && (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
                无法加载详情
              </div>
            )}

            {detailData && (
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
                    {detailData.submitter?.name || '用户'} · 提交于 {formatFullDate(detailData.submittedAt || detailData.createdAt)}
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

                {/* Attachments */}
                {detailData.items?.some(item => item.receiptUrl) && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                      附件凭证
                    </h4>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                    }}>
                      {detailData.items?.filter(item => item.receiptUrl).map((item, index) => (
                        <div
                          key={`receipt-${item.id}-${index}`}
                          onClick={() => setPreviewImage(item.receiptUrl || null)}
                          style={{
                            position: 'relative',
                            paddingBottom: '100%',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <img
                            src={item.receiptUrl}
                            alt={`凭证 ${index + 1}`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: '4px',
                            right: '4px',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}>
                            点击放大
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions for pending */}
                {detailData.status === 'pending' && (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: '#374151' }}>
                        审批意见
                      </label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="输入审批意见（拒绝时必填）..."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '14px',
                          minHeight: '80px',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={handleReject}
                        disabled={!comment || processing}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          backgroundColor: (!comment || processing) ? '#f3f4f6' : 'white',
                          color: (!comment || processing) ? '#9ca3af' : '#dc2626',
                          border: (!comment || processing) ? '1px solid #e5e7eb' : '1px solid #dc2626',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: (!comment || processing) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {processing ? '处理中...' : '拒绝'}
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={processing}
                        style={{
                          flex: 1,
                          padding: '10px 16px',
                          background: processing ? '#9ca3af' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: processing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {processing ? '处理中...' : '批准'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Status indicator for history */}
                {detailData.status === 'approved' && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontSize: '13px', color: '#166534', fontWeight: 500 }}>
                      ✓ 已批准
                    </p>
                  </div>
                )}

                {detailData.status === 'rejected' && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#fee2e2',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontSize: '13px', color: '#dc2626', fontWeight: 500 }}>
                      ✗ 已拒绝
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
