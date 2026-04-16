'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

// ============================================================================
// Types
// ============================================================================

interface CorrectionApplication {
  id: string;
  targetReimbursementId: string;
  targetReimbursementTitle: string;
  appliedAmount: number;
  originalPaymentAmount: number;
  adjustedPaymentAmount: number;
  appliedAt: string;
}

interface Correction {
  id: string;
  originalReimbursementId: string;
  originalReimbursementTitle: string;
  employeeId: string;
  employeeName: string;
  originalPaidAmount: number;
  correctedAmount: number;
  differenceAmount: number;
  appliedAmount: number;
  remainingAmount: number;
  status: 'pending' | 'partial' | 'settled' | 'cancelled';
  reason: string;
  errorCategory: string | null;
  flaggedAt: string;
  applications?: CorrectionApplication[];
}

interface ReimbursementLookup {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  totalAmountInBaseCurrency: number;
  userName: string;
  userId: string;
  submittedAt: string;
}

// ============================================================================
// Helpers
// ============================================================================

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '待冲差',   color: '#d97706', bg: '#fef3c7' },
  partial:   { label: '部分冲差', color: '#2563eb', bg: '#dbeafe' },
  settled:   { label: '已完成',   color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: '已取消',   color: '#6b7280', bg: '#f3f4f6' },
};

function fmt(amount: number) {
  return `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// ============================================================================
// Component
// ============================================================================

export default function CorrectionsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const tc = t.corrections;

  // List state
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createReimbId, setCreateReimbId] = useState('');
  const [createReimbInfo, setCreateReimbInfo] = useState<ReimbursementLookup | null>(null);
  const [fetchingReimb, setFetchingReimb] = useState(false);
  const [createCorrectedAmount, setCreateCorrectedAmount] = useState('');
  const [createErrorCategory, setCreateErrorCategory] = useState('amount_error');
  const [createReason, setCreateReason] = useState('');
  const [createNote, setCreateNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Apply modal state
  const [applyTarget, setApplyTarget] = useState<Correction | null>(null);
  const [applyReimbId, setApplyReimbId] = useState('');
  const [applyReimbInfo, setApplyReimbInfo] = useState<ReimbursementLookup | null>(null);
  const [fetchingApplyReimb, setFetchingApplyReimb] = useState(false);
  const [applyAmount, setApplyAmount] = useState('');
  const [applyNote, setApplyNote] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<Correction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const fetchCorrections = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const params = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const res = await fetch(`/api/corrections${params}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (res.status === 403) { setFetchError('没有权限查看冲差记录'); setLoading(false); return; }
      const data = await res.json();
      if (data.success) {
        setCorrections(data.corrections || []);
      } else {
        setFetchError(data.error || tc.errorFetch);
      }
    } catch {
      setFetchError(tc.errorFetch);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, router, tc.errorFetch]);

  useEffect(() => { fetchCorrections(); }, [fetchCorrections]);

  // Pre-fill reimbursement ID from ?reimbId= query param (coming from disbursements page)
  // Use window.location.search directly to avoid useSearchParams Suspense requirement
  useEffect(() => {
    const reimbId = new URLSearchParams(window.location.search).get('reimbId');
    if (reimbId) {
      resetCreateModal();
      setCreateReimbId(reimbId);
      setShowCreateModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill apply modal from ?applyCorrection=<cid>&targetReimbId=<rid>&suggestedAmount=<n>
  // Triggered after corrections list loads (so we can find the correction by id).
  // Only fires once per matching URL — keyed by a ref so hot-reload / re-renders don't re-trigger.
  const autoAppliedRef = useRef<string | null>(null);
  // Track whether the current apply modal session was auto-prefilled (for "从付款页带入" hint)
  const [applyAutoPrefilled, setApplyAutoPrefilled] = useState(false);
  useEffect(() => {
    if (corrections.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const correctionId = params.get('applyCorrection');
    const targetReimbId = params.get('targetReimbId');
    if (!correctionId || !targetReimbId) return;
    if (autoAppliedRef.current === correctionId) return;
    const correction = corrections.find(c => c.id === correctionId);
    if (!correction) return;
    autoAppliedRef.current = correctionId;

    resetApplyModal();
    setApplyTarget(correction);
    setApplyReimbId(targetReimbId);
    setApplyAutoPrefilled(true);

    // Auto-lookup the target reimbursement and pre-fill amount
    (async () => {
      setFetchingApplyReimb(true);
      try {
        const info = await lookupReimbursement(targetReimbId);
        if (!info) {
          setApplyError('找不到目标报销单，请检查链接');
          return;
        }
        setApplyError(null);
        setApplyReimbInfo(info);
        const suggestedAmountStr = params.get('suggestedAmount');
        const suggestedAmount = suggestedAmountStr ? parseFloat(suggestedAmountStr) : NaN;
        const defaultAmount = !isNaN(suggestedAmount) && suggestedAmount > 0
          ? Math.min(suggestedAmount, correction.remainingAmount, info.totalAmountInBaseCurrency)
          : Math.min(correction.remainingAmount, info.totalAmountInBaseCurrency);
        setApplyAmount(defaultAmount.toFixed(2));
      } finally {
        setFetchingApplyReimb(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corrections]);

  // ── Reimb lookup helper ─────────────────────────────────────────────────────

  async function lookupReimbursement(input: string): Promise<ReimbursementLookup | null> {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // 如果用户粘贴的不是完整 UUID（例如 `#86208B80` 或 `#RF-2026-ABCDE`），
    // 先走 resolve 接口解析成真实 UUID，再查详情。
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let realId = trimmed;
    if (!UUID_RE.test(trimmed)) {
      const resolveRes = await fetch(
        `/api/reimbursements/resolve?code=${encodeURIComponent(trimmed)}`,
      );
      const resolveData = await resolveRes.json().catch(() => null);
      if (!resolveRes.ok || !resolveData?.success || !resolveData.id) {
        return null;
      }
      realId = resolveData.id;
    }

    const res = await fetch(`/api/reimbursements/${realId}`);
    if (!res.ok) return null;
    const data = await res.json();
    // 兼容 { data: {...} } 和 { reimbursement: {...} } 两种返回格式
    const r = data.reimbursement || data.data;
    if (!r) return null;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      totalAmount: r.totalAmount,
      totalAmountInBaseCurrency: r.totalAmountInBaseCurrency || r.totalAmount,
      userName: r.userName || r.submitter?.name || r.user?.name || '未知',
      userId: r.userId || r.submitter?.id || r.user?.id || '',
      submittedAt: r.submittedAt || r.createdAt,
    };
  }

  // ── Load detail (applications) ──────────────────────────────────────────────

  async function loadDetail(correctionId: string) {
    if (expandedId === correctionId) { setExpandedId(null); return; }
    setExpandedId(correctionId);
    const res = await fetch(`/api/corrections/${correctionId}`);
    const data = await res.json();
    if (data.success && data.correction) {
      setCorrections(prev => prev.map(c =>
        c.id === correctionId ? { ...c, applications: data.correction.applications } : c
      ));
    }
  }

  // ── Create correction ───────────────────────────────────────────────────────

  async function handleFetchReimb() {
    setFetchingReimb(true);
    setCreateReimbInfo(null);
    const info = await lookupReimbursement(createReimbId);
    setFetchingReimb(false);
    if (!info) { setCreateError('找不到该报销单，请检查 ID'); return; }
    setCreateError(null);
    setCreateReimbInfo(info);
    setCreateCorrectedAmount(info.totalAmountInBaseCurrency.toFixed(2));
  }

  async function handleCreate() {
    if (!createReimbInfo) return;
    const corrected = parseFloat(createCorrectedAmount);
    if (isNaN(corrected) || corrected < 0) { setCreateError('请输入有效的正确金额'); return; }
    if (!createReason.trim()) { setCreateError('请填写错误说明'); return; }
    try {
      setCreating(true);
      setCreateError(null);
      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalReimbursementId: createReimbInfo.id,
          correctedAmount: corrected,
          errorCategory: createErrorCategory,
          reason: createReason,
          correctionNote: createNote || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        resetCreateModal();
        fetchCorrections();
        alert(data.message || tc.successCreate);
      } else {
        setCreateError(data.error || '创建失败');
      }
    } catch {
      setCreateError('网络错误，请重试');
    } finally {
      setCreating(false);
    }
  }

  function resetCreateModal() {
    setCreateReimbId('');
    setCreateReimbInfo(null);
    setCreateCorrectedAmount('');
    setCreateErrorCategory('amount_error');
    setCreateReason('');
    setCreateNote('');
    setCreateError(null);
  }

  // ── Apply correction ────────────────────────────────────────────────────────

  async function handleFetchApplyReimb() {
    setFetchingApplyReimb(true);
    setApplyReimbInfo(null);
    const info = await lookupReimbursement(applyReimbId);
    setFetchingApplyReimb(false);
    if (!info) { setApplyError('找不到该报销单，请检查 ID'); return; }
    setApplyError(null);
    setApplyReimbInfo(info);
    if (applyTarget) {
      const suggested = Math.min(applyTarget.remainingAmount, info.totalAmountInBaseCurrency);
      setApplyAmount(suggested.toFixed(2));
    }
  }

  async function handleApply() {
    if (!applyTarget || !applyReimbInfo) return;
    const amount = parseFloat(applyAmount);
    if (isNaN(amount) || amount <= 0) { setApplyError('请输入有效的抵扣金额'); return; }
    if (amount > applyTarget.remainingAmount) {
      setApplyError(`抵扣金额不能超过剩余差额 ${fmt(applyTarget.remainingAmount)}`);
      return;
    }
    try {
      setApplying(true);
      setApplyError(null);
      const res = await fetch(`/api/corrections/${applyTarget.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetReimbursementId: applyReimbInfo.id,
          appliedAmount: amount,
          note: applyNote || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setApplyTarget(null);
        resetApplyModal();
        fetchCorrections();
        alert(data.message || tc.successApply);
      } else {
        setApplyError(data.error || '操作失败');
      }
    } catch {
      setApplyError('网络错误，请重试');
    } finally {
      setApplying(false);
    }
  }

  function resetApplyModal() {
    setApplyReimbId('');
    setApplyReimbInfo(null);
    setApplyAmount('');
    setApplyNote('');
    setApplyError(null);
    setApplyAutoPrefilled(false);
  }

  // ── Cancel correction ───────────────────────────────────────────────────────

  async function handleCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { setCancelError('请填写取消原因'); return; }
    try {
      setCancelling(true);
      setCancelError(null);
      const res = await fetch(`/api/corrections/${cancelTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelReason }),
      });
      const data = await res.json();
      if (data.success) {
        setCancelTarget(null);
        setCancelReason('');
        fetchCorrections();
        alert(tc.successCancel);
      } else {
        setCancelError(data.error || '取消失败');
      }
    } catch {
      setCancelError('网络错误，请重试');
    } finally {
      setCancelling(false);
    }
  }

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = corrections.filter(c => filterStatus === 'all' || c.status === filterStatus);

  const filterTabs = [
    { key: 'all', label: tc.filterAll },
    { key: 'pending', label: tc.filterPending },
    { key: 'partial', label: tc.filterPartial },
    { key: 'settled', label: tc.filterSettled },
    { key: 'cancelled', label: tc.filterCancelled },
  ];

  const errorCategories = [
    { value: 'amount_error', label: tc.errorCategoryOptions.amount_error },
    { value: 'category_error', label: tc.errorCategoryOptions.category_error },
    { value: 'duplicate', label: tc.errorCategoryOptions.duplicate },
    { value: 'policy_violation', label: tc.errorCategoryOptions.policy_violation },
    { value: 'other', label: tc.errorCategoryOptions.other },
  ];

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
            {tc.title}
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{tc.description}</p>
        </div>
        <button
          onClick={() => { resetCreateModal(); setShowCreateModal(true); }}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {tc.newCorrection}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: filterStatus === tab.key ? 600 : 400,
              color: filterStatus === tab.key ? '#2563eb' : '#6b7280',
              border: 'none',
              borderBottom: filterStatus === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <span style={{ marginLeft: '0.375rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                ({corrections.filter(c => c.status === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {fetchError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' }}>
          ⚠️ {fetchError}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>{tc.noData}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(c => {
            const s = STATUS_STYLES[c.status] || STATUS_STYLES.pending;
            const isOverpaid = c.differenceAmount > 0;
            const isExpanded = expandedId === c.id;
            const canApply = c.status === 'pending' || c.status === 'partial';
            const canCancel = c.status === 'pending' && c.appliedAmount === 0;

            return (
              <div key={c.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.75rem', overflow: 'hidden' }}>
                {/* Main row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 100px 100px 100px auto', gap: '0.75rem', alignItems: 'center', padding: '1rem 1.25rem' }}>
                  {/* Employee + reimb */}
                  <div>
                    <p style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem' }}>{c.employeeName}</p>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.originalReimbursementTitle}
                    </p>
                    {c.errorCategory && (
                      <span style={{ fontSize: '0.7rem', background: '#f3f4f6', color: '#6b7280', padding: '0.125rem 0.375rem', borderRadius: '9999px', marginTop: '0.25rem', display: 'inline-block' }}>
                        {errorCategories.find(e => e.value === c.errorCategory)?.label || c.errorCategory}
                      </span>
                    )}
                  </div>

                  {/* Reason */}
                  <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.4 }}>
                    <span style={{ color: isOverpaid ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                      {isOverpaid ? '▲ 多付' : '▼ 少付'} {fmt(c.differenceAmount)}
                    </span>
                    <p style={{ color: '#6b7280', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {c.reason}
                    </p>
                  </div>

                  {/* Amounts */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>原付 / 应付</p>
                    <p style={{ fontSize: '0.85rem', color: '#374151' }}>{fmt(c.originalPaidAmount)}</p>
                    <p style={{ fontSize: '0.85rem', color: '#16a34a' }}>{fmt(c.correctedAmount)}</p>
                  </div>

                  {/* Applied */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>已冲差</p>
                    <p style={{ fontSize: '0.85rem', color: '#374151' }}>{fmt(c.appliedAmount)}</p>
                  </div>

                  {/* Remaining */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>剩余</p>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: c.remainingAmount > 0 ? '#d97706' : '#16a34a' }}>
                      {fmt(c.remainingAmount)}
                    </p>
                  </div>

                  {/* Status */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.color, background: s.bg, padding: '0.25rem 0.625rem', borderRadius: '9999px' }}>
                      {s.label}
                    </span>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>{fmtDate(c.flaggedAt)}</p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'flex-end' }}>
                    {canApply && (
                      <button
                        onClick={() => { setApplyTarget(c); resetApplyModal(); }}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '0.375rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {tc.applyBtn}
                      </button>
                    )}
                    <button
                      onClick={() => loadDetail(c.id)}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '0.375rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {isExpanded ? '收起' : tc.detailBtn}
                    </button>
                    {canCancel && (
                      <button
                        onClick={() => { setCancelTarget(c); setCancelReason(''); setCancelError(null); }}
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '0.375rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {tc.cancelBtn}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded applications */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '1rem 1.25rem', background: '#f9fafb' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>{tc.applications}</p>
                    {!c.applications ? (
                      <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>加载中...</p>
                    ) : c.applications.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>暂无抵扣记录</p>
                    ) : (
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: '#9ca3af' }}>
                            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', fontWeight: 500 }}>{tc.appTargetReimb}</th>
                            <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontWeight: 500 }}>{tc.appAppliedAmount}</th>
                            <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontWeight: 500 }}>{tc.appAdjustedPayment}</th>
                            <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontWeight: 500 }}>{tc.appAppliedAt}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.applications.map(app => (
                            <tr key={app.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '0.375rem 0.5rem', color: '#374151' }}>{app.targetReimbursementTitle}</td>
                              <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: '#dc2626' }}>-{fmt(app.appliedAmount)}</td>
                              <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: '#16a34a' }}>{fmt(app.adjustedPaymentAmount)}</td>
                              <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: '#9ca3af' }}>{fmtDate(app.appliedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Correction Modal ────────────────────────────────────────── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '520px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{tc.createTitle}</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b7280', marginBottom: '1.25rem' }}>{tc.createDesc}</p>

            {/* Reimb ID lookup */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                {tc.labelReimbId}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={createReimbId}
                  onChange={e => { setCreateReimbId(e.target.value); setCreateReimbInfo(null); }}
                  placeholder={tc.labelReimbIdHint}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', fontFamily: 'monospace' }}
                />
                <button
                  onClick={handleFetchReimb}
                  disabled={!createReimbId.trim() || fetchingReimb}
                  style={{ padding: '0.5rem 0.875rem', background: createReimbId.trim() ? '#2563eb' : '#d1d5db', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: createReimbId.trim() ? 'pointer' : 'default', fontSize: '0.825rem', whiteSpace: 'nowrap' }}
                >
                  {fetchingReimb ? tc.fetchingReimb : tc.fetchReimb}
                </button>
              </div>
            </div>

            {/* Reimb info card */}
            {createReimbInfo && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.825rem' }}>
                <p style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.25rem' }}>✓ {tc.reimbInfo}</p>
                <p style={{ color: '#374151' }}><b>标题：</b>{createReimbInfo.title}</p>
                <p style={{ color: '#374151' }}><b>员工：</b>{createReimbInfo.userName}</p>
                <p style={{ color: '#374151' }}><b>状态：</b>{createReimbInfo.status}</p>
                <p style={{ color: '#374151' }}><b>已付金额：</b>{fmt(createReimbInfo.totalAmountInBaseCurrency)}</p>
                {createReimbInfo.status !== 'paid' && (
                  <p style={{ color: '#dc2626', marginTop: '0.25rem' }}>⚠️ 只能对已付款报销单创建冲差</p>
                )}
              </div>
            )}

            {createReimbInfo && createReimbInfo.status === 'paid' && (
              <>
                {/* Corrected amount */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                    {tc.labelCorrectedAmount}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={createCorrectedAmount}
                    onChange={e => setCreateCorrectedAmount(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', boxSizing: 'border-box' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{tc.labelCorrectedAmountHint}</p>
                  {createCorrectedAmount && createReimbInfo && !isNaN(parseFloat(createCorrectedAmount)) && (
                    <p style={{ fontSize: '0.8rem', marginTop: '0.375rem', color: parseFloat(createCorrectedAmount) < createReimbInfo.totalAmountInBaseCurrency ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                      {parseFloat(createCorrectedAmount) < createReimbInfo.totalAmountInBaseCurrency
                        ? `差额：多付 ${fmt(createReimbInfo.totalAmountInBaseCurrency - parseFloat(createCorrectedAmount))}，将从后续报销中扣回`
                        : parseFloat(createCorrectedAmount) > createReimbInfo.totalAmountInBaseCurrency
                        ? `差额：少付 ${fmt(parseFloat(createCorrectedAmount) - createReimbInfo.totalAmountInBaseCurrency)}，将在后续报销中补付`
                        : '金额与原付相同，无需冲差'}
                    </p>
                  )}
                </div>

                {/* Error category */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                    {tc.labelErrorCategory}
                  </label>
                  <select
                    value={createErrorCategory}
                    onChange={e => setCreateErrorCategory(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', background: 'white', boxSizing: 'border-box' }}
                  >
                    {errorCategories.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Reason */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                    {tc.labelReason} <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    value={createReason}
                    onChange={e => setCreateReason(e.target.value)}
                    placeholder={tc.labelReasonPlaceholder}
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Note */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                    {tc.labelNote}
                  </label>
                  <input
                    value={createNote}
                    onChange={e => setCreateNote(e.target.value)}
                    placeholder={tc.labelNotePlaceholder}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', boxSizing: 'border-box' }}
                  />
                </div>
              </>
            )}

            {createError && (
              <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '0.75rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
                {createError}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => { setShowCreateModal(false); resetCreateModal(); }} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                取消
              </button>
              {createReimbInfo && createReimbInfo.status === 'paid' && (
                <button
                  onClick={handleCreate}
                  disabled={creating || !createReason.trim() || !createCorrectedAmount}
                  style={{ padding: '0.5rem 1rem', background: creating || !createReason.trim() ? '#d1d5db' : '#2563eb', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: creating || !createReason.trim() ? 'default' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
                >
                  {creating ? tc.creating : tc.createSubmit}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Apply Modal ────────────────────────────────────────────────────── */}
      {applyTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '500px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{tc.applyTitle}</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b7280', marginBottom: '1.25rem' }}>{tc.applyDesc}</p>

            {/* Correction summary */}
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.825rem' }}>
              <p style={{ fontWeight: 600, color: '#c2410c', marginBottom: '0.25rem' }}>{tc.correctionInfo}</p>
              <p style={{ color: '#374151' }}><b>员工：</b>{applyTarget.employeeName}</p>
              <p style={{ color: '#374151' }}><b>原报销：</b>{applyTarget.originalReimbursementTitle}</p>
              <p style={{ color: applyTarget.differenceAmount > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                {applyTarget.differenceAmount > 0
                  ? `多付 ${fmt(applyTarget.differenceAmount)}，本次可抵扣最多 ${fmt(applyTarget.remainingAmount)}`
                  : `少付 ${fmt(Math.abs(applyTarget.differenceAmount))}，本次可补付最多 ${fmt(applyTarget.remainingAmount)}`}
              </p>
            </div>

            {/* Target reimb ID */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                {tc.labelTargetReimbId}
                {applyAutoPrefilled && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 400, color: '#2563eb', background: '#eff6ff', padding: '0.125rem 0.5rem', borderRadius: '0.25rem' }}>
                    📎 从付款页带入，直接点「确认抵扣」即可
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={applyReimbId}
                  onChange={e => { setApplyReimbId(e.target.value); setApplyReimbInfo(null); setApplyAutoPrefilled(false); }}
                  placeholder={tc.labelTargetReimbIdHint}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', border: applyAutoPrefilled ? '1px solid #bfdbfe' : '1px solid #d1d5db', background: applyAutoPrefilled ? '#f0f9ff' : 'white', borderRadius: '0.375rem', fontSize: '0.825rem', fontFamily: 'monospace' }}
                />
                <button
                  onClick={handleFetchApplyReimb}
                  disabled={!applyReimbId.trim() || fetchingApplyReimb}
                  style={{ padding: '0.5rem 0.875rem', background: applyReimbId.trim() ? '#2563eb' : '#d1d5db', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: applyReimbId.trim() ? 'pointer' : 'default', fontSize: '0.825rem', whiteSpace: 'nowrap' }}
                >
                  {fetchingApplyReimb ? '查询中...' : tc.fetchTarget}
                </button>
              </div>
            </div>

            {applyReimbInfo && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.825rem' }}>
                <p style={{ fontWeight: 600, color: '#15803d', marginBottom: '0.25rem' }}>✓ 目标报销单</p>
                <p style={{ color: '#374151' }}><b>标题：</b>{applyReimbInfo.title}</p>
                <p style={{ color: '#374151' }}><b>状态：</b>{applyReimbInfo.status}</p>
                <p style={{ color: '#374151' }}><b>应付金额：</b>{fmt(applyReimbInfo.totalAmountInBaseCurrency)}</p>
                {applyReimbInfo.userId !== applyTarget.employeeId && (
                  <p style={{ color: '#dc2626', marginTop: '0.25rem' }}>⚠️ 该报销单提交人与冲差员工不一致</p>
                )}
                {applyReimbInfo.status !== 'approved' && (
                  <p style={{ color: '#dc2626', marginTop: '0.25rem' }}>⚠️ 只能对已审批(待付款)报销单应用冲差</p>
                )}
              </div>
            )}

            {/* Applied amount */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                {tc.labelAppliedAmount}
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={applyTarget.remainingAmount}
                value={applyAmount}
                onChange={e => setApplyAmount(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                {tc.labelAppliedAmountHint}（最多 {fmt(applyTarget.remainingAmount)}）
              </p>
            </div>

            {/* Note */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                {tc.labelApplyNote}
              </label>
              <input
                value={applyNote}
                onChange={e => setApplyNote(e.target.value)}
                placeholder="备注"
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', boxSizing: 'border-box' }}
              />
            </div>

            {applyError && (
              <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '0.75rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
                {applyError}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => { setApplyTarget(null); resetApplyModal(); }} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                取消
              </button>
              <button
                onClick={handleApply}
                disabled={applying || !applyReimbInfo || !applyAmount}
                style={{ padding: '0.5rem 1rem', background: applying || !applyReimbInfo || !applyAmount ? '#d1d5db' : '#2563eb', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: applying || !applyReimbInfo || !applyAmount ? 'default' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                {applying ? tc.applying : tc.applySubmit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Modal ───────────────────────────────────────────────────── */}
      {cancelTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '420px', maxWidth: '92vw' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>{tc.cancelTitle}</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b7280', marginBottom: '1.25rem' }}>{tc.cancelDesc}</p>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.825rem' }}>
              <p style={{ color: '#374151' }}><b>员工：</b>{cancelTarget.employeeName}</p>
              <p style={{ color: '#374151' }}><b>原报销：</b>{cancelTarget.originalReimbursementTitle}</p>
              <p style={{ color: '#dc2626', fontWeight: 600 }}>差额 {fmt(cancelTarget.differenceAmount)} 将不再追回</p>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                {tc.labelCancelReason} <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="请说明取消原因..."
                rows={3}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.825rem', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {cancelError && (
              <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '0.75rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '0.375rem' }}>
                {cancelError}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => { setCancelTarget(null); setCancelReason(''); setCancelError(null); }} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                返回
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling || !cancelReason.trim()}
                style={{ padding: '0.5rem 1rem', background: cancelling || !cancelReason.trim() ? '#d1d5db' : '#dc2626', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: cancelling || !cancelReason.trim() ? 'default' : 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                {cancelling ? tc.cancelling : tc.cancelSubmit}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
