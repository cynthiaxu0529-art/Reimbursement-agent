'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Reconciliation {
  reimbursementId: string;
  amount: number;
  note: string;
  createdAt: string;
  reimbursement?: {
    id: string;
    title: string;
    totalAmount: number;
  };
}

interface Advance {
  id: string;
  title: string;
  description: string;
  purpose: string;
  amount: number;
  currency: string;
  status: string;
  reconciledAmount: number;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
  reconciledAt?: string;
  rejectReason?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    department?: string;
  };
  reconciliations: Reconciliation[];
}

interface Reimbursement {
  id: string;
  title: string;
  totalAmount: number;
  totalAmountInBaseCurrency: number;
  status: string;
  baseCurrency: string;
}

const statusConfig: Record<string, { label: string; bgColor: string; color: string }> = {
  pending: { label: '待审批', bgColor: '#fef3c7', color: '#d97706' },
  approved: { label: '已批准', bgColor: '#dcfce7', color: '#16a34a' },
  paid: { label: '已打款', bgColor: '#dbeafe', color: '#2563eb' },
  reconciling: { label: '核销中', bgColor: '#e0e7ff', color: '#4f46e5' },
  reconciled: { label: '已核销', bgColor: '#dcfce7', color: '#059669' },
  rejected: { label: '已拒绝', bgColor: '#fee2e2', color: '#dc2626' },
  cancelled: { label: '已取消', bgColor: '#f3f4f6', color: '#6b7280' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
};

export default function AdvancesPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 新建表单
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);

  // 核销
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [selectedReimbursementId, setSelectedReimbursementId] = useState('');
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileNote, setReconcileNote] = useState('');

  // 用户角色
  const [userRole, setUserRole] = useState<string>('employee');

  useEffect(() => {
    fetchAdvances();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const res = await fetch('/api/settings/role');
      const data = await res.json();
      if (data.success && data.role) {
        setUserRole(data.role);
      }
    } catch {}
  };

  const fetchAdvances = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/advances');
      const data = await res.json();
      if (data.success) {
        setAdvances(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch advances:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formTitle || !formAmount || Number(formAmount) <= 0) {
      alert('请填写标题和有效金额');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          purpose: formPurpose,
          amount: Number(formAmount),
          currency: formCurrency,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFormTitle('');
        setFormDescription('');
        setFormPurpose('');
        setFormAmount('');
        setActiveTab('list');
        fetchAdvances();
      } else {
        alert(data.error || '提交失败');
      }
    } catch {
      alert('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('确认取消该预借款申请？')) return;
    try {
      const res = await fetch(`/api/advances/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchAdvances();
      } else {
        alert(data.error || '取消失败');
      }
    } catch {
      alert('取消失败');
    }
  };

  const handleApprove = async (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const reason = prompt('请输入拒绝原因');
      if (reason === null) return;
      try {
        const res = await fetch(`/api/advances/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reason }),
        });
        const data = await res.json();
        if (data.success) fetchAdvances();
        else alert(data.error);
      } catch { alert('操作失败'); }
      return;
    }

    try {
      const res = await fetch(`/api/advances/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) fetchAdvances();
      else alert(data.error);
    } catch { alert('操作失败'); }
  };

  const openReconcile = async (id: string) => {
    setReconcilingId(id);
    setSelectedReimbursementId('');
    setReconcileAmount('');
    setReconcileNote('');
    // 获取已批准的报销单用于核销
    try {
      const res = await fetch('/api/reimbursements?status=approved&status=paid');
      const data = await res.json();
      if (data.success) {
        setReimbursements(data.data || []);
      }
    } catch {}
  };

  const handleReconcile = async () => {
    if (!reconcilingId || !selectedReimbursementId || !reconcileAmount) {
      alert('请选择报销单并填写核销金额');
      return;
    }

    try {
      const res = await fetch(`/api/advances/${reconcilingId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reimbursementId: selectedReimbursementId,
          amount: Number(reconcileAmount),
          note: reconcileNote,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReconcilingId(null);
        fetchAdvances();
      } else {
        alert(data.error || '核销失败');
      }
    } catch {
      alert('核销失败');
    }
  };

  const isFinanceOrAdmin = ['admin', 'super_admin', 'finance'].includes(userRole);

  // 统计
  const totalPending = advances.filter((a: Advance) => a.status === 'pending').reduce((sum: number, a: Advance) => sum + a.amount, 0);
  const totalOutstanding = advances
    .filter((a: Advance) => ['approved', 'paid', 'reconciling'].includes(a.status))
    .reduce((sum: number, a: Advance) => sum + a.amount - (a.reconciledAmount || 0), 0);
  const totalReconciled = advances
    .filter((a: Advance) => ['reconciling', 'reconciled'].includes(a.status))
    .reduce((sum: number, a: Advance) => sum + (a.reconciledAmount || 0), 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* 标题和Tab */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('list')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              backgroundColor: activeTab === 'list' ? '#2563eb' : '#f3f4f6',
              color: activeTab === 'list' ? 'white' : '#4b5563',
            }}
          >
            预借款列表
          </button>
          <button
            onClick={() => setActiveTab('new')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
              backgroundColor: activeTab === 'new' ? '#2563eb' : '#f3f4f6',
              color: activeTab === 'new' ? 'white' : '#4b5563',
            }}
          >
            + 申请预借款
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {activeTab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>待审批金额</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>
              ${totalPending.toFixed(2)}
            </div>
          </Card>
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>待核销余额</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>
              ${totalOutstanding.toFixed(2)}
            </div>
          </Card>
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>已核销金额</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
              ${totalReconciled.toFixed(2)}
            </div>
          </Card>
        </div>
      )}

      {/* 新建预借款表单 */}
      {activeTab === 'new' && (
        <Card style={{ padding: '2rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1.5rem' }}>申请预借款</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#374151' }}>
                标题 *
              </label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="例如：3月出差预借款"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#374151' }}>
                用途
              </label>
              <Input
                value={formPurpose}
                onChange={(e) => setFormPurpose(e.target.value)}
                placeholder="例如：北京出差、客户招待"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#374151' }}>
                说明
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="详细说明预借款原因..."
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  minHeight: '80px',
                  resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#374151' }}>
                  金额 *
                </label>
                <Input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div style={{ width: '120px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: '#374151' }}>
                  币种
                </label>
                <select
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? '提交中...' : '提交申请'}
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('list')}>
                取消
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 预借款列表 */}
      {activeTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>加载中...</div>
          ) : advances.length === 0 ? (
            <Card style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
              <div style={{ color: '#6b7280' }}>暂无预借款记录</div>
              <Button
                onClick={() => setActiveTab('new')}
                style={{ marginTop: '1rem' }}
              >
                申请预借款
              </Button>
            </Card>
          ) : (
            advances.map((advance) => {
              const sc = statusConfig[advance.status] || statusConfig.pending;
              const remaining = advance.amount - (advance.reconciledAmount || 0);
              const isExpanded = expandedId === advance.id;
              const sym = currencySymbols[advance.currency] || '$';

              return (
                <Card key={advance.id} style={{ overflow: 'hidden' }}>
                  {/* 主行 */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : advance.id)}
                    style={{
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{advance.title}</span>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            backgroundColor: sc.bgColor,
                            color: sc.color,
                          }}
                        >
                          {sc.label}
                        </span>
                      </div>
                      {advance.purpose && (
                        <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>用途：{advance.purpose}</div>
                      )}
                      {advance.user && isFinanceOrAdmin && (
                        <div style={{ fontSize: '0.8125rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                          申请人：{advance.user.name}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                        {sym}{advance.amount.toFixed(2)}
                      </div>
                      {['approved', 'paid', 'reconciling', 'reconciled'].includes(advance.status) && (
                        <div style={{ fontSize: '0.75rem', color: remaining > 0.01 ? '#d97706' : '#059669' }}>
                          {remaining > 0.01 ? `待核销: ${sym}${remaining.toFixed(2)}` : '已全部核销'}
                        </div>
                      )}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                      {new Date(advance.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div style={{
                      padding: '1rem 1.25rem',
                      borderTop: '1px solid #f3f4f6',
                      backgroundColor: '#fafafa',
                    }}>
                      {advance.description && (
                        <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: '#4b5563' }}>
                          {advance.description}
                        </div>
                      )}

                      {advance.rejectReason && (
                        <div style={{
                          padding: '0.5rem 0.75rem',
                          backgroundColor: '#fee2e2',
                          borderRadius: '0.375rem',
                          fontSize: '0.8125rem',
                          color: '#dc2626',
                          marginBottom: '0.75rem',
                        }}>
                          拒绝原因：{advance.rejectReason}
                        </div>
                      )}

                      {/* 核销记录 */}
                      {advance.reconciliations && advance.reconciliations.length > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>
                            核销记录
                          </div>
                          {advance.reconciliations.map((r, idx) => (
                            <div key={idx} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '0.375rem 0.5rem',
                              backgroundColor: 'white',
                              borderRadius: '0.25rem',
                              marginBottom: '0.25rem',
                              fontSize: '0.8125rem',
                            }}>
                              <span style={{ color: '#4b5563' }}>
                                {r.reimbursement?.title || r.reimbursementId.slice(0, 8)}
                              </span>
                              <span style={{ fontWeight: 600, color: '#059669' }}>
                                -{sym}{r.amount.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 操作按钮 */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {advance.status === 'pending' && !isFinanceOrAdmin && (
                          <Button
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); handleCancel(advance.id); }}
                            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                          >
                            取消申请
                          </Button>
                        )}
                        {advance.status === 'pending' && isFinanceOrAdmin && (
                          <>
                            <Button
                              onClick={(e) => { e.stopPropagation(); handleApprove(advance.id, 'approve'); }}
                              style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', backgroundColor: '#16a34a' }}
                            >
                              批准
                            </Button>
                            <Button
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); handleApprove(advance.id, 'reject'); }}
                              style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', color: '#dc2626', borderColor: '#dc2626' }}
                            >
                              拒绝
                            </Button>
                          </>
                        )}
                        {['approved', 'paid', 'reconciling'].includes(advance.status) && remaining > 0.01 && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); openReconcile(advance.id); }}
                            style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
                          >
                            核销
                          </Button>
                        )}
                      </div>

                      {/* 核销表单 */}
                      {reconcilingId === advance.id && (
                        <div style={{
                          marginTop: '0.75rem',
                          padding: '1rem',
                          backgroundColor: 'white',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb',
                        }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                            核销预借款（关联报销单）
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', color: '#4b5563' }}>
                                选择报销单
                              </label>
                              <select
                                value={selectedReimbursementId}
                                onChange={(e) => setSelectedReimbursementId(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.8125rem',
                                }}
                              >
                                <option value="">请选择报销单...</option>
                                {reimbursements.map(r => (
                                  <option key={r.id} value={r.id}>
                                    {r.title} - ${(r.totalAmountInBaseCurrency || r.totalAmount).toFixed(2)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', color: '#4b5563' }}>
                                核销金额 (最多 {sym}{remaining.toFixed(2)})
                              </label>
                              <Input
                                type="number"
                                value={reconcileAmount}
                                onChange={(e) => setReconcileAmount(e.target.value)}
                                placeholder="0.00"
                                max={remaining}
                                step="0.01"
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', color: '#4b5563' }}>
                                备注
                              </label>
                              <Input
                                value={reconcileNote}
                                onChange={(e) => setReconcileNote(e.target.value)}
                                placeholder="核销备注（可选）"
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <Button onClick={handleReconcile} style={{ fontSize: '0.8125rem' }}>
                                确认核销
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setReconcilingId(null)}
                                style={{ fontSize: '0.8125rem' }}
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
