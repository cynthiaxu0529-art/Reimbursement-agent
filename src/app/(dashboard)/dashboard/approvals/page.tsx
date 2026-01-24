'use client';

import { useState, useEffect } from 'react';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  amountInBaseCurrency?: number;
  date: string;
  receiptUrl?: string;
  vendor?: string;
}

// Risk alert interface
interface RiskAlert {
  id: string;
  type: 'over_budget' | 'anomaly' | 'missing_attachment' | 'policy_violation';
  level: 'high' | 'medium' | 'low';
  itemId?: string;
  message: string;
  standardValue?: number;
  actualValue?: number;
  percentage?: number;
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
  baseCurrency?: string;
  createdAt: string;
  submittedAt?: string;
  items: ReimbursementItem[];
  submitter?: {
    name: string;
    email: string;
  };
  riskAlerts?: RiskAlert[];
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
  under_review: { label: '审核中', color: '#2563eb', bgColor: '#dbeafe' },
  approved: { label: '已批准', color: '#16a34a', bgColor: '#dcfce7' },
  rejected: { label: '已拒绝', color: '#dc2626', bgColor: '#fee2e2' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  KRW: '₩',
};

// Risk level colors
const riskLevelConfig: Record<string, { icon: string; color: string; bgColor: string; label: string }> = {
  high: { icon: '🔴', color: '#dc2626', bgColor: '#fee2e2', label: '超标' },
  medium: { icon: '🟡', color: '#d97706', bgColor: '#fef3c7', label: '异常' },
  low: { icon: '🟠', color: '#ea580c', bgColor: '#ffedd5', label: '提醒' },
};

// Generate reimbursement number
const generateReimbursementNumber = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const idSuffix = id.slice(-4).toUpperCase();
  return `BX${year}${month}${day}-${idSuffix}`;
};

// Mock risk analysis function (in production, this would be from backend)
const analyzeRisks = (item: Reimbursement): RiskAlert[] => {
  const alerts: RiskAlert[] = [];

  // Check each expense item
  item.items?.forEach((expense) => {
    // Hotel over budget check (mock standard: 500 CNY/night)
    if (expense.category === 'hotel' && expense.amount > 500) {
      alerts.push({
        id: `risk-${expense.id}-budget`,
        type: 'over_budget',
        level: 'high',
        itemId: expense.id,
        message: `酒店费用 ¥${expense.amount}/晚 超出标准 ¥500/晚`,
        standardValue: 500,
        actualValue: expense.amount,
        percentage: Math.round(((expense.amount - 500) / 500) * 100),
      });
    }

    // Flight anomaly check (mock: if > 2000 CNY)
    if (expense.category === 'flight' && expense.amount > 2000) {
      alerts.push({
        id: `risk-${expense.id}-anomaly`,
        type: 'anomaly',
        level: 'medium',
        itemId: expense.id,
        message: `机票费用较同期平均高出${Math.round((expense.amount / 1500 - 1) * 100)}%`,
        actualValue: expense.amount,
      });
    }

    // Missing attachment check
    if (!expense.receiptUrl && expense.amount > 100) {
      alerts.push({
        id: `risk-${expense.id}-attachment`,
        type: 'missing_attachment',
        level: 'low',
        itemId: expense.id,
        message: `${categoryLabels[expense.category]?.label || expense.category}费用缺少发票附件`,
      });
    }
  });

  return alerts;
};

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingApprovals, setPendingApprovals] = useState<Reimbursement[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Reimbursement | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Reminder modal state
  const [reminderModal, setReminderModal] = useState<{
    open: boolean;
    reimbursementId: string;
    submitterEmail?: string;
    submitterName?: string;
    alerts: RiskAlert[];
  } | null>(null);
  const [reminderMethod, setReminderMethod] = useState<'email' | 'slack' | 'both'>('email');
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [reminderNote, setReminderNote] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);

  // Fetch approvals
  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const pendingResponse = await fetch('/api/reimbursements?status=pending&role=approver');
        const pendingResult = await pendingResponse.json();
        if (pendingResult.success) {
          // Add risk analysis to each item
          const dataWithRisks = (pendingResult.data || []).map((item: Reimbursement) => ({
            ...item,
            riskAlerts: analyzeRisks(item),
          }));
          setPendingApprovals(dataWithRisks);
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

  // Fetch expanded detail
  useEffect(() => {
    if (!expandedId) {
      setExpandedData(null);
      return;
    }

    const currentList = activeTab === 'pending' ? pendingApprovals : approvalHistory;
    const listItem = currentList.find(r => r.id === expandedId);
    if (listItem) {
      setExpandedData(listItem);
    }

    const fetchDetail = async () => {
      setExpandLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${expandedId}`);
        const result = await response.json();
        if (result.success && result.data) {
          const dataWithRisks = {
            ...result.data,
            riskAlerts: analyzeRisks(result.data),
          };
          setExpandedData(dataWithRisks);
        }
      } catch (error) {
        console.error('Failed to fetch detail:', error);
      } finally {
        setExpandLoading(false);
      }
    };

    fetchDetail();
  }, [expandedId, pendingApprovals, approvalHistory, activeTab]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', comment }),
      });
      const result = await response.json();
      if (result.success) {
        const approved = pendingApprovals.find(a => a.id === id);
        if (approved) {
          approved.status = 'approved';
          setApprovalHistory([approved, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
        setExpandedId(null);
        setComment('');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    if (!reason) {
      alert('请输入拒绝原因');
      return;
    }
    setProcessing(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectReason: reason }),
      });
      const result = await response.json();
      if (result.success) {
        const rejected = pendingApprovals.find(a => a.id === id);
        if (rejected) {
          rejected.status = 'rejected';
          setApprovalHistory([rejected, ...approvalHistory]);
        }
        setPendingApprovals(pendingApprovals.filter(a => a.id !== id));
        setExpandedId(null);
        setComment('');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const openReminderModal = (item: Reimbursement) => {
    setReminderModal({
      open: true,
      reimbursementId: item.id,
      submitterEmail: item.submitter?.email,
      submitterName: item.submitter?.name,
      alerts: item.riskAlerts || [],
    });
    setSelectedAlerts(item.riskAlerts?.filter(a => a.type === 'missing_attachment').map(a => a.id) || []);
    setReminderNote('');
  };

  const sendReminder = async () => {
    if (!reminderModal || selectedAlerts.length === 0) return;

    setSendingReminder(true);
    // Mock sending - in production this would call an API
    await new Promise(resolve => setTimeout(resolve, 1000));

    alert(`已通过${reminderMethod === 'both' ? '邮件和Slack' : reminderMethod === 'email' ? '邮件' : 'Slack'}发送补充提醒`);
    setSendingReminder(false);
    setReminderModal(null);
  };

  // Calculate stats
  const stats = {
    pending: pendingApprovals.length,
    underReview: pendingApprovals.filter(a => a.status === 'under_review').length,
    approved: approvalHistory.filter(a => a.status === 'approved').length,
    rejected: approvalHistory.filter(a => a.status === 'rejected').length,
    withRisks: pendingApprovals.filter(a => (a.riskAlerts?.length || 0) > 0).length,
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const currentList = activeTab === 'pending' ? pendingApprovals : approvalHistory;

  // Get risk count for item
  const getRiskCount = (item: Reimbursement) => item.riskAlerts?.length || 0;
  const getHighestRiskLevel = (item: Reimbursement): 'high' | 'medium' | 'low' | 'none' => {
    if (!item.riskAlerts || item.riskAlerts.length === 0) return 'none';
    if (item.riskAlerts.some(r => r.level === 'high')) return 'high';
    if (item.riskAlerts.some(r => r.level === 'medium')) return 'medium';
    return 'low';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
          报销审批
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>审核和处理待审批的报销申请</p>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            backgroundColor: activeTab === 'pending' ? '#fef3c7' : 'white',
            borderRadius: '12px',
            padding: '16px',
            border: activeTab === 'pending' ? '2px solid #d97706' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>待审批</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
          {stats.withRisks > 0 && (
            <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
              ⚠️ {stats.withRisks}项异常
            </p>
          )}
        </button>

        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>审核中</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>{stats.underReview}</p>
        </div>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            backgroundColor: activeTab === 'history' ? '#dcfce7' : 'white',
            borderRadius: '12px',
            padding: '16px',
            border: activeTab === 'history' ? '2px solid #16a34a' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>已审批</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{stats.approved}</p>
        </button>

        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>已拒绝</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>{stats.rejected}</p>
        </div>
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
          gridTemplateColumns: '150px 100px 1.2fr 90px 90px 120px 120px 60px',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
          alignItems: 'center',
        }}>
          <div>报销编号</div>
          <div>申请人</div>
          <div>报销说明</div>
          <div>提交日期</div>
          <div>状态</div>
          <div style={{ textAlign: 'right' }}>原币金额</div>
          <div style={{ textAlign: 'right' }}>报销金额</div>
          <div style={{ textAlign: 'center' }}>风险</div>
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
            const isExpanded = expandedId === item.id;
            const reimbursementNo = generateReimbursementNumber(item.createdAt, item.id);
            const riskCount = getRiskCount(item);
            const riskLevel = getHighestRiskLevel(item);
            const statusInfo = statusLabels[item.status] || statusLabels.pending;

            // Calculate original currency
            const firstItem = item.items?.[0];
            const originalCurrency = firstItem?.currency || 'CNY';
            const originalAmount = item.items?.reduce((sum, i) => sum + i.amount, 0) || item.totalAmount;
            const currencySymbol = currencySymbols[originalCurrency] || originalCurrency;
            const hasMultipleCurrencies = item.items?.some(i => i.currency !== originalCurrency);

            return (
              <div key={item.id}>
                {/* Main Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '150px 100px 1.2fr 90px 90px 120px 120px 60px',
                    gap: '8px',
                    padding: '14px 16px',
                    borderBottom: isExpanded ? 'none' : '1px solid #e5e7eb',
                    backgroundColor: isExpanded ? '#faf5ff' : 'white',
                    transition: 'background-color 0.15s',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  {/* Reimbursement Number - Clickable */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#7c3aed',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      fontSize: '10px',
                      color: '#6b7280',
                    }}>▶</span>
                    {reimbursementNo}
                  </div>

                  {/* Submitter */}
                  <div style={{ fontSize: '13px', color: '#374151' }}>
                    {item.submitter?.name || '用户'}
                  </div>

                  {/* Description */}
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

                  {/* Submit Date */}
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {formatDate(item.submittedAt || item.createdAt)}
                  </div>

                  {/* Status */}
                  <div>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      padding: '4px 8px',
                      borderRadius: '9999px',
                      backgroundColor: statusInfo.bgColor,
                      color: statusInfo.color,
                    }}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Original Amount */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                      {currencySymbol}{originalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                    <p style={{ fontSize: '10px', color: '#6b7280' }}>
                      {hasMultipleCurrencies ? '多币种' : originalCurrency}
                    </p>
                  </div>

                  {/* Reimbursement Amount */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>
                      ¥{item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {/* Risk Indicator */}
                  <div style={{ textAlign: 'center' }}>
                    {riskLevel === 'none' ? (
                      <span style={{ color: '#16a34a', fontSize: '14px' }}>✓</span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: riskLevelConfig[riskLevel].bgColor,
                        color: riskLevelConfig[riskLevel].color,
                        fontSize: '12px',
                        fontWeight: 500,
                      }}>
                        ⚠️ {riskCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div style={{
                    backgroundColor: '#faf5ff',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '16px',
                  }}>
                    {expandLoading && !expandedData && (
                      <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
                        加载中...
                      </div>
                    )}

                    {expandedData && expandedData.id === item.id && (
                      <div>
                        {/* Risk Alerts Section */}
                        {expandedData.riskAlerts && expandedData.riskAlerts.length > 0 && (
                          <div style={{
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '16px',
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: '10px',
                            }}>
                              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ⚠️ 风险提示
                              </h4>
                              <button
                                onClick={() => openReminderModal(expandedData)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '12px',
                                  color: '#7c3aed',
                                  backgroundColor: 'white',
                                  border: '1px solid #7c3aed',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                📧 发送补充提醒
                              </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {expandedData.riskAlerts.map((alert) => (
                                <div
                                  key={alert.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    backgroundColor: 'white',
                                    borderRadius: '6px',
                                    borderLeft: `3px solid ${riskLevelConfig[alert.level].color}`,
                                  }}
                                >
                                  <span>{riskLevelConfig[alert.level].icon}</span>
                                  <span style={{ fontSize: '13px', color: '#374151' }}>
                                    <strong style={{ color: riskLevelConfig[alert.level].color }}>
                                      {riskLevelConfig[alert.level].label}:
                                    </strong>{' '}
                                    {alert.message}
                                    {alert.percentage && (
                                      <span style={{ color: '#dc2626', fontWeight: 500 }}> (超出{alert.percentage}%)</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Line Items Table */}
                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                            费用明细 ({expandedData.items?.length || 0} 项)
                          </h4>

                          {expandedData.items && expandedData.items.length > 0 ? (
                            <div style={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              overflow: 'hidden',
                            }}>
                              {/* Items Header */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr 120px 100px 120px 40px',
                                gap: '12px',
                                padding: '10px 14px',
                                backgroundColor: '#f9fafb',
                                borderBottom: '1px solid #e5e7eb',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#6b7280',
                                textTransform: 'uppercase',
                              }}>
                                <div>费用项目</div>
                                <div>类别</div>
                                <div style={{ textAlign: 'right' }}>原币金额</div>
                                <div style={{ textAlign: 'center' }}>汇率</div>
                                <div style={{ textAlign: 'right' }}>折算金额</div>
                                <div></div>
                              </div>

                              {/* Items Rows */}
                              {expandedData.items.map((lineItem, idx) => {
                                const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                                const itemCurrency = lineItem.currency || 'CNY';
                                const itemSymbol = currencySymbols[itemCurrency] || itemCurrency;
                                const exchangeRate = itemCurrency === 'CNY' ? 1 : (lineItem.amountInBaseCurrency && lineItem.amount > 0 ? lineItem.amountInBaseCurrency / lineItem.amount : 0.14);
                                const convertedAmount = lineItem.amountInBaseCurrency || lineItem.amount * exchangeRate;
                                const itemRisks = expandedData.riskAlerts?.filter(r => r.itemId === lineItem.id) || [];
                                const hasRisk = itemRisks.length > 0;
                                const itemRiskLevel = itemRisks.find(r => r.level === 'high') ? 'high' : itemRisks.find(r => r.level === 'medium') ? 'medium' : 'low';

                                return (
                                  <div
                                    key={lineItem.id}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '2fr 1fr 120px 100px 120px 40px',
                                      gap: '12px',
                                      padding: '12px 14px',
                                      borderBottom: idx < (expandedData.items?.length || 0) - 1 ? '1px solid #f3f4f6' : 'none',
                                      alignItems: 'center',
                                      backgroundColor: hasRisk ? '#fffbeb' : 'transparent',
                                    }}
                                  >
                                    {/* Item Description */}
                                    <div>
                                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                                        {lineItem.description || catInfo.label}
                                      </p>
                                      {lineItem.vendor && (
                                        <p style={{ fontSize: '11px', color: '#6b7280' }}>
                                          {lineItem.vendor}
                                        </p>
                                      )}
                                      {lineItem.receiptUrl && (
                                        <p
                                          style={{
                                            fontSize: '11px',
                                            color: '#2563eb',
                                            marginTop: '2px',
                                            cursor: 'pointer',
                                          }}
                                          onClick={() => setPreviewImage(lineItem.receiptUrl || null)}
                                        >
                                          📎 查看凭证
                                        </p>
                                      )}
                                    </div>

                                    {/* Category */}
                                    <div>
                                      <span style={{
                                        fontSize: '12px',
                                        color: '#374151',
                                        padding: '3px 8px',
                                        backgroundColor: '#f3f4f6',
                                        borderRadius: '4px',
                                      }}>
                                        {catInfo.icon} {catInfo.label}
                                      </span>
                                    </div>

                                    {/* Original Amount */}
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                                        {itemSymbol}{lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                      </p>
                                      <p style={{ fontSize: '10px', color: '#6b7280' }}>{itemCurrency}</p>
                                    </div>

                                    {/* Exchange Rate */}
                                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
                                      {exchangeRate.toFixed(4)}
                                    </div>

                                    {/* Converted Amount */}
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>
                                        ¥{convertedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>

                                    {/* Risk indicator */}
                                    <div style={{ textAlign: 'center' }}>
                                      {hasRisk ? (
                                        <span style={{ color: riskLevelConfig[itemRiskLevel].color }}>
                                          {riskLevelConfig[itemRiskLevel].icon}
                                        </span>
                                      ) : (
                                        <span style={{ color: '#16a34a' }}>✓</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Total Row */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr 120px 100px 120px 40px',
                                gap: '12px',
                                padding: '12px 14px',
                                backgroundColor: '#f9fafb',
                                borderTop: '1px solid #e5e7eb',
                                alignItems: 'center',
                              }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                                  合计
                                </div>
                                <div></div>
                                <div></div>
                                <div></div>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a' }}>
                                    ¥{expandedData.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <div></div>
                              </div>
                            </div>
                          ) : (
                            <p style={{ fontSize: '13px', color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                              暂无明细
                            </p>
                          )}
                        </div>

                        {/* Actions for pending */}
                        {expandedData.status === 'pending' && (
                          <div style={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '16px',
                          }}>
                            <div style={{ marginBottom: '12px' }}>
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
                                  minHeight: '60px',
                                  resize: 'vertical',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                              {expandedData.riskAlerts && expandedData.riskAlerts.length > 0 && (
                                <button
                                  onClick={() => openReminderModal(expandedData)}
                                  style={{
                                    padding: '10px 16px',
                                    fontSize: '14px',
                                    color: '#7c3aed',
                                    backgroundColor: 'white',
                                    border: '1px solid #7c3aed',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                  }}
                                >
                                  📧 提醒补充
                                </button>
                              )}
                              <button
                                onClick={() => handleReject(item.id, comment)}
                                disabled={!comment || processing === item.id}
                                style={{
                                  padding: '10px 20px',
                                  backgroundColor: (!comment || processing === item.id) ? '#f3f4f6' : 'white',
                                  color: (!comment || processing === item.id) ? '#9ca3af' : '#dc2626',
                                  border: (!comment || processing === item.id) ? '1px solid #e5e7eb' : '1px solid #dc2626',
                                  borderRadius: '8px',
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  cursor: (!comment || processing === item.id) ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {processing === item.id ? '处理中...' : '✕ 拒绝'}
                              </button>
                              <button
                                onClick={() => handleApprove(item.id)}
                                disabled={processing === item.id}
                                style={{
                                  padding: '10px 20px',
                                  background: processing === item.id ? '#9ca3af' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  cursor: processing === item.id ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {processing === item.id ? '处理中...' : '✓ 批准'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Status for history */}
                        {expandedData.status === 'approved' && (
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

                        {expandedData.status === 'rejected' && (
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Reminder Modal */}
      {reminderModal?.open && (
        <div
          onClick={() => setReminderModal(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                📧 发送补充提醒
              </h3>
              <button
                onClick={() => setReminderModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontSize: '20px',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px' }}>
              {/* Recipient Info */}
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>发送给</p>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                  {reminderModal.submitterName || '用户'} ({reminderModal.submitterEmail || 'email@example.com'})
                </p>
              </div>

              {/* Send Method */}
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>发送方式</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { value: 'email', label: '📧 邮件' },
                    { value: 'slack', label: '💬 Slack' },
                    { value: 'both', label: '📧💬 两者都发' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        border: reminderMethod === option.value ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: reminderMethod === option.value ? '#faf5ff' : 'white',
                      }}
                    >
                      <input
                        type="radio"
                        name="reminderMethod"
                        value={option.value}
                        checked={reminderMethod === option.value}
                        onChange={(e) => setReminderMethod(e.target.value as 'email' | 'slack' | 'both')}
                        style={{ display: 'none' }}
                      />
                      <span style={{ fontSize: '13px', color: '#374151' }}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Select Alerts */}
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>需要补充的内容</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {reminderModal.alerts.map((alert) => (
                    <label
                      key={alert.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: selectedAlerts.includes(alert.id) ? '#faf5ff' : 'white',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAlerts.includes(alert.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAlerts([...selectedAlerts, alert.id]);
                          } else {
                            setSelectedAlerts(selectedAlerts.filter(id => id !== alert.id));
                          }
                        }}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {riskLevelConfig[alert.level].icon} {alert.message}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>备注信息</p>
                <textarea
                  value={reminderNote}
                  onChange={(e) => setReminderNote(e.target.value)}
                  placeholder="请补充相关材料，如有特殊情况请说明。"
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

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setReminderModal(null)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#6b7280',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={sendReminder}
                  disabled={selectedAlerts.length === 0 || sendingReminder}
                  style={{
                    padding: '10px 20px',
                    background: (selectedAlerts.length === 0 || sendingReminder) ? '#9ca3af' : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: (selectedAlerts.length === 0 || sendingReminder) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sendingReminder ? '发送中...' : '发送提醒'}
                </button>
              </div>
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
