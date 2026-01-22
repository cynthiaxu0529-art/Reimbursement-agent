'use client';

import { useState } from 'react';
import Link from 'next/link';

// 模拟数据
const pendingApprovals = [
  {
    id: '1',
    title: '深圳出差报销',
    submitter: '张三',
    submitterAvatar: 'Z',
    department: '技术部',
    amount: 4560,
    items: 5,
    submittedAt: '2024-01-18 14:30',
    trip: '深圳客户演示',
    complianceStatus: 'passed',
    details: [
      { category: '机票', amount: 1280, icon: '✈️' },
      { category: '酒店', amount: 1800, icon: '🏨' },
      { category: '餐饮', amount: 580, icon: '🍽️' },
      { category: '交通', amount: 450, icon: '🚕' },
      { category: '其他', amount: 450, icon: '📦' },
    ]
  },
  {
    id: '2',
    title: '云服务费用报销',
    submitter: '李四',
    submitterAvatar: 'L',
    department: '技术部',
    amount: 8900,
    items: 3,
    submittedAt: '2024-01-17 10:15',
    complianceStatus: 'warning',
    complianceIssue: '云资源费用超出月度预算的 80%',
    details: [
      { category: 'AWS 服务', amount: 5200, icon: '☁️' },
      { category: 'OpenAI API', amount: 2500, icon: '🤖' },
      { category: '其他云服务', amount: 1200, icon: '💾' },
    ]
  },
  {
    id: '3',
    title: '团建活动费用',
    submitter: '王五',
    submitterAvatar: 'W',
    department: '人力资源',
    amount: 3200,
    items: 2,
    submittedAt: '2024-01-16 16:45',
    complianceStatus: 'passed',
    details: [
      { category: '聚餐', amount: 2400, icon: '🍽️' },
      { category: '活动', amount: 800, icon: '🎯' },
    ]
  },
];

const approvalHistory = [
  {
    id: '4',
    title: '上海出差报销',
    submitter: '赵六',
    amount: 3895,
    action: 'approved',
    actionAt: '2024-01-15 11:20',
  },
  {
    id: '5',
    title: '办公用品采购',
    submitter: '张三',
    amount: 560,
    action: 'approved',
    actionAt: '2024-01-14 09:30',
  },
  {
    id: '6',
    title: '超标差旅费用',
    submitter: '李四',
    amount: 12000,
    action: 'rejected',
    actionAt: '2024-01-13 15:00',
    reason: '酒店费用超出政策限额，未提前申请特批',
  },
];

export default function ApprovalsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [showApproveModal, setShowApproveModal] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const handleApprove = (id: string) => {
    console.log('Approve:', id, comment);
    setShowApproveModal(null);
    setComment('');
  };

  const handleReject = (id: string) => {
    console.log('Reject:', id, comment);
    setShowRejectModal(null);
    setComment('');
  };

  const totalPendingAmount = pendingApprovals.reduce((sum, a) => sum + a.amount, 0);

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
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706' }}>{pendingApprovals.length}</p>
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
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>本月已审批</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>24</p>
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
                ¥{totalPendingAmount.toLocaleString()}
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
            backgroundColor: activeTab === 'pending' ? '#eff6ff' : 'transparent',
            color: activeTab === 'pending' ? '#2563eb' : '#6b7280',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          待审批 ({pendingApprovals.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'history' ? '#eff6ff' : 'transparent',
            color: activeTab === 'history' ? '#2563eb' : '#6b7280',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          审批历史
        </button>
      </div>

      {/* Pending Approvals */}
      {activeTab === 'pending' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          {pendingApprovals.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <p style={{ color: '#6b7280' }}>没有待审批的报销</p>
            </div>
          ) : (
            pendingApprovals.map((approval, index) => (
              <div
                key={approval.id}
                style={{
                  padding: '1.25rem',
                  borderBottom: index < pendingApprovals.length - 1 ? '1px solid #e5e7eb' : 'none'
                }}
              >
                {/* Main Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        backgroundColor: '#2563eb',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 500,
                        fontSize: '0.875rem'
                      }}>
                        {approval.submitterAvatar}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h4 style={{ fontWeight: 600, color: '#111827' }}>{approval.title}</h4>
                          {approval.complianceStatus === 'warning' && (
                            <span style={{
                              padding: '0.125rem 0.5rem',
                              backgroundColor: '#fef3c7',
                              color: '#d97706',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 500
                            }}>
                              合规警告
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {approval.submitter} · {approval.department} · {approval.items} 项费用
                        </p>
                      </div>
                    </div>

                    <div style={{ marginLeft: '2.75rem' }}>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                        提交于 {approval.submittedAt}
                      </p>
                      {approval.trip && (
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          关联行程：{approval.trip}
                        </p>
                      )}
                      {approval.complianceIssue && (
                        <p style={{
                          fontSize: '0.875rem',
                          color: '#d97706',
                          marginTop: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          ⚠️ {approval.complianceIssue}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
                      ¥{approval.amount.toLocaleString()}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setExpandedId(expandedId === approval.id ? null : approval.id)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          backgroundColor: 'white',
                          color: '#6b7280',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        {expandedId === approval.id ? '收起' : '详情'}
                      </button>
                      <button
                        onClick={() => setShowApproveModal(approval.id)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        批准
                      </button>
                      <button
                        onClick={() => setShowRejectModal(approval.id)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          backgroundColor: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === approval.id && (
                  <div style={{
                    marginTop: '1rem',
                    marginLeft: '2.75rem',
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.5rem'
                  }}>
                    <h5 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                      费用明细
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                      {approval.details.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: 'white',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span>{item.icon}</span>
                            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{item.category}</span>
                          </div>
                          <p style={{ fontWeight: 600, color: '#111827' }}>¥{item.amount.toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      <p style={{ fontSize: '0.875rem', color: '#16a34a' }}>
                        ✓ 已上传 {approval.items} 张票据 · OCR 识别完成
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Approval History */}
      {activeTab === 'history' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          {approvalHistory.map((item, index) => (
            <div
              key={item.id}
              style={{
                padding: '1rem 1.25rem',
                borderBottom: index < approvalHistory.length - 1 ? '1px solid #f3f4f6' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  backgroundColor: item.action === 'approved' ? '#dcfce7' : '#fee2e2',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem'
                }}>
                  {item.action === 'approved' ? '✓' : '✕'}
                </div>
                <div>
                  <p style={{ fontWeight: 500, color: '#111827' }}>{item.title}</p>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {item.submitter} · {item.actionAt}
                  </p>
                  {item.reason && (
                    <p style={{ fontSize: '0.875rem', color: '#dc2626', marginTop: '0.25rem' }}>
                      {item.reason}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 600, color: '#111827' }}>¥{item.amount.toLocaleString()}</p>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: item.action === 'approved' ? '#16a34a' : '#dc2626'
                }}>
                  {item.action === 'approved' ? '已批准' : '已拒绝'}
                </span>
              </div>
            </div>
          ))}
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
              确定要批准这笔报销申请吗？
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
                onClick={() => handleApprove(showApproveModal)}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
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
                onClick={() => handleReject(showRejectModal)}
                disabled={!comment}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: comment ? '#dc2626' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: 500,
                  cursor: comment ? 'pointer' : 'not-allowed'
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
