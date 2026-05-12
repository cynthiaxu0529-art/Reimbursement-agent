'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface ReconciliationListItem {
  id: string;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  rowCount: number;
  status: 'parsing' | 'completed' | 'failed';
  csvTotalAmount: number;
  matchedCount: number;
  matchedAmount: number;
  discrepancyCount: number;
  uploadedBy: string;
  createdAt: string;
}

type DiscrepancyType =
  | 'system_only'
  | 'chain_only'
  | 'amount_mismatch'
  | 'address_mismatch'
  | 'duplicate_payment'
  | 'low_confidence_match';

interface DiscrepancyRow {
  id: string;
  type: DiscrepancyType;
  paymentId: string | null;
  csvRowIndex: number | null;
  csvRowSnapshot: Record<string, unknown> | null;
  matchedBy: string | null;
  matchConfidence: string | null;
  details: Record<string, unknown>;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  payment: {
    id: string;
    reimbursementId: string;
    amount: number;
    currency: string;
    txHash: string | null;
    payoutId: string | null;
    toAddress: string | null;
    paidAt: string | null;
    payoutStatus: string | null;
    reimbursementTitle: string;
    employee: { id: string; name: string; email: string } | null;
  } | null;
}

interface PeriodSummaryRow {
  periodId: string;
  walletOutflowTotal: number;
  walletOutflowCount: number;
  systemPaymentsTotal: number;
  systemPaymentsCount: number;
  systemBookedTotal: number;
  systemBookedCount: number;
  diffPayments: number;
  diffBooked: number;
  walletOnlyRowIndexes: number[];
  systemOnlyPaymentIds: string[];
  reviewStatus: 'unreviewed' | 'reviewed' | 'accepted';
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface ReconciliationDetail {
  reconciliation: ReconciliationListItem & {
    rawRows: unknown[];
    toleranceConfig: Record<string, unknown>;
  };
  discrepancies: DiscrepancyRow[];
}

// ============================================================================
// Helpers
// ============================================================================

const TYPE_LABELS: Record<DiscrepancyType, string> = {
  system_only: '系统有 / 链上无',
  chain_only: '链上有 / 系统无',
  amount_mismatch: '金额不符',
  address_mismatch: '收款地址不符',
  duplicate_payment: '重复支付',
  low_confidence_match: '低置信匹配（需人工确认）',
};

const TYPE_COLORS: Record<DiscrepancyType, { bg: string; fg: string }> = {
  system_only:          { bg: '#fef2f2', fg: '#b91c1c' },
  chain_only:           { bg: '#fff7ed', fg: '#c2410c' },
  amount_mismatch:      { bg: '#fef9c3', fg: '#a16207' },
  address_mismatch:     { bg: '#fdf2f8', fg: '#be185d' },
  duplicate_payment:    { bg: '#fee2e2', fg: '#991b1b' },
  low_confidence_match: { bg: '#eff6ff', fg: '#1d4ed8' },
};

function fmtMoney(v: number, ccy = 'USD'): string {
  return `${v.toFixed(2)} ${ccy}`;
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('zh-CN', { hour12: false });
}

function shortHash(s: string | null | undefined, head = 6, tail = 4): string {
  if (!s) return '—';
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// ============================================================================
// Main Page
// ============================================================================

export default function WalletReconciliationPage() {
  const [list, setList] = useState<ReconciliationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterType, setFilterType] = useState<DiscrepancyType | 'all' | 'unresolved'>('unresolved');
  const [view, setView] = useState<'items' | 'periods'>('items');
  const [periods, setPeriods] = useState<PeriodSummaryRow[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wallet-reconciliations');
      const data = await res.json();
      if (data.success) setList(data.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/wallet-reconciliations/${id}`);
      const data = await res.json();
      if (data.success) setDetail(data.data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchPeriods = useCallback(async (id: string) => {
    setPeriodsLoading(true);
    try {
      const res = await fetch(`/api/wallet-reconciliations/${id}/period-summary`);
      const data = await res.json();
      if (data.success) setPeriods(data.data || []);
    } finally {
      setPeriodsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
      fetchPeriods(selectedId);
    } else {
      setDetail(null);
      setPeriods([]);
    }
  }, [selectedId, fetchDetail, fetchPeriods]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/wallet-reconciliations', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadError(data.error || '上传失败');
        return;
      }
      await fetchList();
      setSelectedId(data.data.id);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRerun = async (id: string) => {
    if (!confirm('重新跑匹配会刷新差异列表（已标处理的会保留），继续吗？')) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/wallet-reconciliations/${id}/rerun`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchList();
        await fetchDetail(id);
      } else {
        alert(data.error || '重跑失败');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResolve = async (
    discId: string,
    unresolve: boolean,
  ) => {
    if (!selectedId) return;
    let note = '';
    if (!unresolve) {
      const input = prompt('备注（可选，最多 1000 字）：', '');
      if (input === null) return;
      note = input;
    }
    const res = await fetch(
      `/api/wallet-reconciliations/${selectedId}/discrepancies/${discId}/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, unresolve }),
      },
    );
    const data = await res.json();
    if (data.success) {
      await fetchDetail(selectedId);
    } else {
      alert(data.error || '操作失败');
    }
  };

  const handleReviewPeriod = async (
    periodId: string,
    status: 'unreviewed' | 'reviewed' | 'accepted',
  ) => {
    if (!selectedId) return;
    let note = '';
    if (status !== 'unreviewed') {
      const promptMsg = status === 'accepted'
        ? '接受这个月的差异（合理差异，不再追究）。请填写说明（审计可见）：'
        : '标记此月已审核。请填写说明（可选）：';
      const input = prompt(promptMsg, '');
      if (input === null) return;
      if (status === 'accepted' && !input.trim()) {
        alert('"接受差异"必须填写说明');
        return;
      }
      note = input.trim();
    }
    const res = await fetch(
      `/api/wallet-reconciliations/${selectedId}/period-summary/${periodId}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      },
    );
    const data = await res.json();
    if (data.success) {
      await fetchPeriods(selectedId);
    } else {
      alert(data.error || '操作失败');
    }
  };

  const filteredDiscrepancies = (detail?.discrepancies || []).filter((d) => {
    if (filterType === 'all') return true;
    if (filterType === 'unresolved') return !d.resolved;
    return d.type === filterType;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>钱包对账</h1>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          上传 Fluxa 钱包导出的转账清单（CSV），系统按 txHash → payoutId → 模糊匹配
          三级 fallback 配对到 payments 表的成功转账，并把不一致的项标出来。
        </p>
      </div>

      <UploadCard onUpload={handleUpload} uploading={uploading} error={uploadError} />

      <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: detail ? '1fr 2fr' : '1fr', gap: '24px' }}>
        <ListPanel
          list={list}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedId && (
          <DetailPanel
            detail={detail}
            loading={detailLoading}
            filterType={filterType}
            onFilterChange={setFilterType}
            filteredDiscrepancies={filteredDiscrepancies}
            onRerun={() => handleRerun(selectedId)}
            onResolve={handleResolve}
            view={view}
            onViewChange={setView}
            periods={periods}
            periodsLoading={periodsLoading}
            onReviewPeriod={handleReviewPeriod}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Upload card
// ============================================================================

function UploadCard({
  onUpload,
  uploading,
  error,
}: {
  onUpload: (file: File) => void;
  uploading: boolean;
  error: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#111827' }}>
        上传 Fluxa 转账清单
      </h2>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onUpload(f);
        }}
        style={{
          display: 'block',
          border: `2px dashed ${dragOver ? '#2563eb' : '#d1d5db'}`,
          borderRadius: '10px',
          padding: '32px',
          textAlign: 'center',
          backgroundColor: dragOver ? '#eff6ff' : '#f9fafb',
          cursor: uploading ? 'wait' : 'pointer',
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
        {uploading ? (
          <p style={{ fontSize: '14px', color: '#2563eb' }}>上传中…正在解析并匹配…</p>
        ) : (
          <>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📤</div>
            <p style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>
              点击或拖拽 CSV 文件上传
            </p>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              至少包含：txHash, amount, toAddress, timestamp（其它字段如 payoutId、gasFee、token 也会被识别）
            </p>
          </>
        )}
      </label>
      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '10px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// List panel
// ============================================================================

function ListPanel({
  list,
  loading,
  selectedId,
  onSelect,
}: {
  list: ReconciliationListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#111827' }}>
        历史对账 ({list.length})
      </h2>
      {loading ? (
        <p style={{ fontSize: '13px', color: '#6b7280' }}>加载中…</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#6b7280' }}>暂无对账记录</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {list.map((r) => {
            const isSel = r.id === selectedId;
            const hasDiff = r.discrepancyCount > 0;
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `1px solid ${isSel ? '#2563eb' : '#e5e7eb'}`,
                  backgroundColor: isSel ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>
                    {r.fileName}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backgroundColor: hasDiff ? '#fef2f2' : '#ecfdf5',
                      color: hasDiff ? '#b91c1c' : '#047857',
                      whiteSpace: 'nowrap',
                      marginLeft: '8px',
                    }}
                  >
                    {hasDiff ? `${r.discrepancyCount} 项差异` : '全部对上'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {r.rowCount} 笔 · 链上合计 {fmtMoney(r.csvTotalAmount)} · 已匹配 {r.matchedCount}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  {fmtDate(r.createdAt)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Detail panel
// ============================================================================

function DetailPanel({
  detail,
  loading,
  filterType,
  onFilterChange,
  filteredDiscrepancies,
  onRerun,
  onResolve,
  view,
  onViewChange,
  periods,
  periodsLoading,
  onReviewPeriod,
}: {
  detail: ReconciliationDetail | null;
  loading: boolean;
  filterType: DiscrepancyType | 'all' | 'unresolved';
  onFilterChange: (t: DiscrepancyType | 'all' | 'unresolved') => void;
  filteredDiscrepancies: DiscrepancyRow[];
  onRerun: () => void;
  onResolve: (discId: string, unresolve: boolean) => void;
  view: 'items' | 'periods';
  onViewChange: (v: 'items' | 'periods') => void;
  periods: PeriodSummaryRow[];
  periodsLoading: boolean;
  onReviewPeriod: (periodId: string, status: 'unreviewed' | 'reviewed' | 'accepted') => void;
}) {
  if (loading || !detail) {
    return (
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '13px',
        }}
      >
        {loading ? '加载详情中…' : '请选择左侧记录'}
      </div>
    );
  }

  const r = detail.reconciliation;
  const allTypes = Array.from(new Set(detail.discrepancies.map((d) => d.type))) as DiscrepancyType[];
  const unresolvedCount = detail.discrepancies.filter((d) => !d.resolved).length;

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      {/* Summary header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>
            {r.fileName}
          </h2>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            {r.periodStart && r.periodEnd ? `${fmtDate(r.periodStart)} ~ ${fmtDate(r.periodEnd)}` : '时间范围未知'}
          </p>
        </div>
        <button
          onClick={onRerun}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
            color: '#374151',
          }}
        >
          🔄 重跑匹配
        </button>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
        <TabButton label="明细对账" sublabel="逐笔匹配" active={view === 'items'} onClick={() => onViewChange('items')} />
        <TabButton label="按期对账" sublabel="月度总额 vs 钱包实付" active={view === 'periods'} onClick={() => onViewChange('periods')} />
      </div>

      {view === 'periods' ? (
        <PeriodSummaryView periods={periods} loading={periodsLoading} onReview={onReviewPeriod} />
      ) : (
        <ItemsView
          detail={detail}
          filterType={filterType}
          onFilterChange={onFilterChange}
          filteredDiscrepancies={filteredDiscrepancies}
          onResolve={onResolve}
          r={r}
          allTypes={allTypes}
          unresolvedCount={unresolvedCount}
        />
      )}
    </div>
  );
}

/**
 * 按笔对账视图（原 DetailPanel 主体，抽出来）
 */
function ItemsView({
  detail,
  filterType,
  onFilterChange,
  filteredDiscrepancies,
  onResolve,
  r,
  allTypes,
  unresolvedCount,
}: {
  detail: ReconciliationDetail;
  filterType: DiscrepancyType | 'all' | 'unresolved';
  onFilterChange: (t: DiscrepancyType | 'all' | 'unresolved') => void;
  filteredDiscrepancies: DiscrepancyRow[];
  onResolve: (discId: string, unresolve: boolean) => void;
  r: ReconciliationListItem;
  allTypes: DiscrepancyType[];
  unresolvedCount: number;
}) {
  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <Stat label="链上行数" value={String(r.rowCount)} />
        <Stat label="链上合计" value={fmtMoney(r.csvTotalAmount)} />
        <Stat label="已匹配" value={`${r.matchedCount} / ${fmtMoney(r.matchedAmount)}`} />
        <Stat
          label="差异未处理 / 总数"
          value={`${unresolvedCount} / ${detail.discrepancies.length}`}
          highlight={unresolvedCount > 0}
        />
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <FilterChip
          label={`未处理 (${unresolvedCount})`}
          active={filterType === 'unresolved'}
          onClick={() => onFilterChange('unresolved')}
        />
        <FilterChip
          label={`全部 (${detail.discrepancies.length})`}
          active={filterType === 'all'}
          onClick={() => onFilterChange('all')}
        />
        {allTypes.map((t) => (
          <FilterChip
            key={t}
            label={`${TYPE_LABELS[t]} (${detail.discrepancies.filter((d) => d.type === t).length})`}
            active={filterType === t}
            onClick={() => onFilterChange(t)}
          />
        ))}
      </div>

      {/* Discrepancy list */}
      {filteredDiscrepancies.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '13px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          {detail.discrepancies.length === 0 ? '🎉 全部对上，没有差异' : '当前筛选下无记录'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredDiscrepancies.map((d) => (
            <DiscrepancyCard key={d.id} d={d} onResolve={onResolve} />
          ))}
        </div>
      )}
    </>
  );
}

function TabButton({ label, sublabel, active, onClick }: { label: string; sublabel?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
        cursor: 'pointer',
        color: active ? '#1e40af' : '#6b7280',
        fontSize: '13px',
        fontWeight: active ? 600 : 500,
        marginBottom: '-1px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '2px',
      }}
    >
      {label}
      {sublabel && (
        <span style={{ fontSize: '10px', fontWeight: 400, color: active ? '#3b82f6' : '#9ca3af' }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

function PeriodSummaryView({
  periods,
  loading,
  onReview,
}: {
  periods: PeriodSummaryRow[];
  loading: boolean;
  onReview: (periodId: string, status: 'unreviewed' | 'reviewed' | 'accepted') => void;
}) {
  if (loading) {
    return <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: '#6b7280' }}>加载按期对账数据中…</div>;
  }
  if (periods.length === 0) {
    return <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px' }}>无可对账的月份数据</div>;
  }

  const totalDiff = periods.reduce((s, p) => s + Math.abs(p.diffBooked), 0);

  return (
    <div>
      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
        按月对比三种口径：<b>钱包实付</b>（CSV confirmed outflow）vs <b>系统 payments 成功</b>（基于 paidAt）vs <b>系统记账</b>（基于 item.date）。
        三者本应一致；差异通常源于迟报跨期、应付未付、汇率波动或票据 vs 实付口径差。
        差异合计 <b style={{ color: totalDiff > 0 ? '#b91c1c' : '#047857' }}>{fmtMoney(totalDiff)}</b>。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {periods.map((p) => (
          <PeriodSummaryCard key={p.periodId} p={p} onReview={onReview} />
        ))}
      </div>
    </div>
  );
}

function PeriodSummaryCard({
  p,
  onReview,
}: {
  p: PeriodSummaryRow;
  onReview: (periodId: string, status: 'unreviewed' | 'reviewed' | 'accepted') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = Math.abs(p.diffBooked) > 0.01 || Math.abs(p.diffPayments) > 0.01;
  const statusColor = p.reviewStatus === 'accepted'
    ? { bg: '#ecfdf5', fg: '#047857', label: '已接受差异' }
    : p.reviewStatus === 'reviewed'
    ? { bg: '#eff6ff', fg: '#1e40af', label: '已审核' }
    : hasDiff
    ? { bg: '#fef2f2', fg: '#b91c1c', label: '未处理' }
    : { bg: '#f0fdf4', fg: '#047857', label: '一致' };

  return (
    <div
      style={{
        padding: '12px',
        border: `1px solid ${p.reviewStatus !== 'unreviewed' ? '#d1fae5' : hasDiff ? '#fecaca' : '#e5e7eb'}`,
        borderRadius: '8px',
        backgroundColor: p.reviewStatus !== 'unreviewed' ? '#f0fdf4' : '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{p.periodId}</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: statusColor.bg,
              color: statusColor.fg,
              fontWeight: 600,
            }}
          >
            {statusColor.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {p.reviewStatus === 'unreviewed' ? (
            <>
              <button
                onClick={() => onReview(p.periodId, 'reviewed')}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  border: '1px solid #2563eb',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                标记已审核
              </button>
              {hasDiff && (
                <button
                  onClick={() => onReview(p.periodId, 'accepted')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    border: '1px solid #10b981',
                    backgroundColor: '#fff',
                    color: '#047857',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  接受差异
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => onReview(p.periodId, 'unreviewed')}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: '#374151',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              撤销
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#374151',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {expanded ? '收起' : '详情'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px' }}>
        <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
          <p style={{ color: '#6b7280', marginBottom: '4px' }}>钱包实付 ({p.walletOutflowCount} 笔)</p>
          <p style={{ fontWeight: 600, color: '#111827' }}>{fmtMoney(p.walletOutflowTotal)}</p>
        </div>
        <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
          <p style={{ color: '#6b7280', marginBottom: '4px' }}>系统 payments ({p.systemPaymentsCount} 笔)</p>
          <p style={{ fontWeight: 600, color: '#111827' }}>{fmtMoney(p.systemPaymentsTotal)}</p>
          <p style={{ fontSize: '10px', color: Math.abs(p.diffPayments) > 0.01 ? '#b91c1c' : '#047857', marginTop: '2px' }}>
            差 {p.diffPayments >= 0 ? '+' : ''}{p.diffPayments.toFixed(2)}
          </p>
        </div>
        <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
          <p style={{ color: '#6b7280', marginBottom: '4px' }}>系统记账 ({p.systemBookedCount} 项)</p>
          <p style={{ fontWeight: 600, color: '#111827' }}>{fmtMoney(p.systemBookedTotal)}</p>
          <p style={{ fontSize: '10px', color: Math.abs(p.diffBooked) > 0.01 ? '#b91c1c' : '#047857', marginTop: '2px' }}>
            差 {p.diffBooked >= 0 ? '+' : ''}{p.diffBooked.toFixed(2)}
          </p>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                钱包有 / 系统无（{p.walletOnlyRowIndexes.length} 行）
              </p>
              <p style={{ fontSize: '11px', color: '#6b7280' }}>
                {p.walletOnlyRowIndexes.length === 0 ? '—' : `CSV 行索引: ${p.walletOnlyRowIndexes.slice(0, 10).join(', ')}${p.walletOnlyRowIndexes.length > 10 ? ' …' : ''}`}
              </p>
            </div>
            <div>
              <p style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                系统有 / 钱包无（{p.systemOnlyPaymentIds.length} 笔）
              </p>
              <p style={{ fontSize: '11px', color: '#6b7280', wordBreak: 'break-all' }}>
                {p.systemOnlyPaymentIds.length === 0 ? '—' : `payment IDs: ${p.systemOnlyPaymentIds.slice(0, 3).map(id => id.slice(0, 8)).join(', ')}${p.systemOnlyPaymentIds.length > 3 ? ' …' : ''}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {p.reviewStatus !== 'unreviewed' && p.reviewNote && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 10px',
            backgroundColor: '#ecfdf5',
            borderLeft: '3px solid #10b981',
            fontSize: '12px',
            color: '#065f46',
          }}
        >
          处理说明：{p.reviewNote}
          {p.reviewedAt && <span style={{ marginLeft: '8px', color: '#6b7280' }}>· {fmtDate(p.reviewedAt)}</span>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        backgroundColor: highlight ? '#fef2f2' : '#f9fafb',
        border: `1px solid ${highlight ? '#fecaca' : '#e5e7eb'}`,
        borderRadius: '8px',
      }}
    >
      <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{label}</p>
      <p style={{ fontSize: '14px', fontWeight: 600, color: highlight ? '#991b1b' : '#111827' }}>{value}</p>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: '12px',
        border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
        backgroundColor: active ? '#2563eb' : '#fff',
        color: active ? '#fff' : '#374151',
        borderRadius: '999px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function DiscrepancyCard({ d, onResolve }: { d: DiscrepancyRow; onResolve: (id: string, unresolve: boolean) => void }) {
  const color = TYPE_COLORS[d.type];
  const csv = d.csvRowSnapshot as Record<string, unknown> | null;
  const detailsObj = d.details || {};

  return (
    <div
      style={{
        padding: '12px',
        border: `1px solid ${d.resolved ? '#d1fae5' : '#e5e7eb'}`,
        borderRadius: '8px',
        backgroundColor: d.resolved ? '#f0fdf4' : '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: color.bg,
              color: color.fg,
              fontWeight: 600,
            }}
          >
            {TYPE_LABELS[d.type]}
          </span>
          {d.matchedBy && (
            <span style={{ fontSize: '11px', color: '#6b7280' }}>
              匹配方式: {d.matchedBy}
              {d.matchConfidence && ` · ${d.matchConfidence}`}
            </span>
          )}
          {d.resolved && (
            <span style={{ fontSize: '11px', color: '#047857' }}>
              ✓ 已处理 {d.resolvedAt ? fmtDate(d.resolvedAt) : ''}
            </span>
          )}
        </div>
        <button
          onClick={() => onResolve(d.id, d.resolved)}
          style={{
            padding: '4px 10px',
            fontSize: '12px',
            border: `1px solid ${d.resolved ? '#d1d5db' : '#10b981'}`,
            backgroundColor: d.resolved ? '#fff' : '#10b981',
            color: d.resolved ? '#374151' : '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {d.resolved ? '撤销处理' : '标记已处理'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
        {/* System / payment side */}
        <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
          <p style={{ fontWeight: 600, marginBottom: '6px', color: '#374151' }}>系统 payment</p>
          {d.payment ? (
            <>
              <KV k="报销" v={d.payment.reimbursementTitle} />
              <KV k="员工" v={d.payment.employee?.name || '—'} />
              <KV k="金额" v={fmtMoney(d.payment.amount, d.payment.currency)} />
              <KV k="收款" v={shortHash(d.payment.toAddress)} />
              <KV k="txHash" v={shortHash(d.payment.txHash, 8, 6)} />
              <KV k="payoutId" v={shortHash(d.payment.payoutId, 8, 4)} />
              <KV k="付款时间" v={fmtDate(d.payment.paidAt)} />
            </>
          ) : (
            <p style={{ color: '#9ca3af' }}>—</p>
          )}
        </div>

        {/* CSV / chain side */}
        <div style={{ padding: '8px', backgroundColor: '#fafafa', borderRadius: '6px' }}>
          <p style={{ fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Fluxa 清单行</p>
          {csv ? (
            <>
              <KV k="金额" v={`${csv.amount} ${csv.token || ''}`} />
              <KV k="收款" v={shortHash(csv.toAddress as string | null)} />
              <KV k="txHash" v={shortHash(csv.txHash as string | null, 8, 6)} />
              <KV k="payoutId" v={shortHash((csv.payoutId as string | null) || null, 8, 4)} />
              <KV k="时间" v={fmtDate(csv.timestamp as string | null)} />
              {csv.gasFee !== undefined && <KV k="gasFee" v={String(csv.gasFee)} />}
            </>
          ) : (
            <p style={{ color: '#9ca3af' }}>—</p>
          )}
        </div>
      </div>

      {Object.keys(detailsObj).length > 0 && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ fontSize: '11px', color: '#6b7280', cursor: 'pointer' }}>详情</summary>
          <pre
            style={{
              marginTop: '6px',
              padding: '8px',
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              fontSize: '11px',
              overflow: 'auto',
            }}
          >
            {JSON.stringify(detailsObj, null, 2)}
          </pre>
        </details>
      )}

      {d.resolved && d.resolutionNote && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 10px',
            backgroundColor: '#ecfdf5',
            borderLeft: '3px solid #10b981',
            fontSize: '12px',
            color: '#065f46',
          }}
        >
          处理说明：{d.resolutionNote}
        </div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
      <span style={{ color: '#6b7280', minWidth: '60px' }}>{k}:</span>
      <span style={{ color: '#111827', wordBreak: 'break-all' }}>{v}</span>
    </div>
  );
}
