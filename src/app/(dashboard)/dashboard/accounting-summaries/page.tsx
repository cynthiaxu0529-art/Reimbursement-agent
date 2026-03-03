'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

// ============================================================================
// Types
// ============================================================================

interface SummaryDetail {
  employee_name: string;
  department: string;
  amount: number;
  description: string;
  item_id: string;
  reimbursement_id: string;
  category: string;
  account_code: string;
  account_name: string;
}

interface SummaryItem {
  account_code: string;
  account_name: string;
  total_amount: number;
  record_count: number;
  details: SummaryDetail[];
}

interface Summary {
  summary_id: string;
  period_start: string;
  period_end: string;
  items: SummaryItem[];
  total_amount: number;
  total_records: number;
  currency: string;
}

interface SyncedAccount {
  accountCode: string;
  accountName: string;
  accountSubtype: string | null;
}

// ============================================================================
// Mapping Rules (for display)
// ============================================================================

const MAPPING_RULES_DISPLAY = [
  {
    expenseType: '差旅 Travel',
    categories: 'taxi, flight, train, hotel, car_rental, fuel, parking, toll',
    rdCode: '6440', smCode: '6130', gaCode: '6270',
  },
  {
    expenseType: '餐饮 Meals',
    categories: 'meal, client_entertainment',
    rdCode: '6450', smCode: '6140', gaCode: '6280',
  },
  {
    expenseType: '办公用品 Office',
    categories: 'office_supplies, equipment, printing',
    rdCode: '6460', smCode: '6150', gaCode: '6230',
  },
  {
    expenseType: '培训 Training',
    categories: 'training, conference',
    rdCode: '6470', smCode: '6160', gaCode: '6330',
  },
  {
    expenseType: '云/AI Cloud',
    categories: 'cloud_resource, ai_token',
    rdCode: '6420', smCode: '6190', gaCode: '6390',
  },
  {
    expenseType: '软件 Software',
    categories: 'software',
    rdCode: '6430', smCode: '6190', gaCode: '6390',
  },
  {
    expenseType: '快递 Shipping',
    categories: 'courier',
    rdCode: '6490', smCode: '6190', gaCode: '6370',
  },
  {
    expenseType: '通讯 Telecom',
    categories: 'phone, internet',
    rdCode: '6490', smCode: '6190', gaCode: '6290',
  },
  {
    expenseType: '广告 Advertising',
    categories: '(keyword match)',
    rdCode: '6490', smCode: '6120', gaCode: '6390',
  },
  {
    expenseType: '其他 Misc',
    categories: '(default)',
    rdCode: '6490', smCode: '6190', gaCode: '6390',
  },
];

const AVAILABLE_ACCOUNTS = [
  // R&D 研发费用
  { code: '6410', name: 'R&D - Salaries & Benefits', group: 'R&D' },
  { code: '6420', name: 'R&D - Cloud & Infrastructure', group: 'R&D' },
  { code: '6430', name: 'R&D - Software & Subscriptions', group: 'R&D' },
  { code: '6440', name: 'R&D - Travel & Entertainment', group: 'R&D' },
  { code: '6450', name: 'R&D - Meals & Entertainment', group: 'R&D' },
  { code: '6460', name: 'R&D - Office Supplies', group: 'R&D' },
  { code: '6470', name: 'R&D - Training & Conferences', group: 'R&D' },
  { code: '6490', name: 'R&D - Miscellaneous Expense', group: 'R&D' },
  // S&M 销售费用
  { code: '6110', name: 'S&M - Salaries & Commissions', group: 'S&M' },
  { code: '6120', name: 'S&M - Advertising & Promotion', group: 'S&M' },
  { code: '6130', name: 'S&M - Travel & Entertainment', group: 'S&M' },
  { code: '6140', name: 'S&M - Meals & Client Entertainment', group: 'S&M' },
  { code: '6150', name: 'S&M - Office Supplies', group: 'S&M' },
  { code: '6160', name: 'S&M - Training & Conferences', group: 'S&M' },
  { code: '6190', name: 'S&M - Miscellaneous Expense', group: 'S&M' },
  // G&A 管理费用
  { code: '6220', name: 'G&A - Rent & Facilities', group: 'G&A' },
  { code: '6230', name: 'G&A - Office Supplies', group: 'G&A' },
  { code: '6240', name: 'G&A - Insurance', group: 'G&A' },
  { code: '6270', name: 'G&A - Travel & Entertainment', group: 'G&A' },
  { code: '6280', name: 'G&A - Meals & Entertainment', group: 'G&A' },
  { code: '6290', name: 'G&A - Telephone & Internet', group: 'G&A' },
  { code: '6330', name: 'G&A - Training & Development', group: 'G&A' },
  { code: '6370', name: 'G&A - Shipping & Postage', group: 'G&A' },
  { code: '6390', name: 'G&A - Miscellaneous Expense', group: 'G&A' },
];

const CATEGORY_LABELS: Record<string, string> = {
  flight: '机票 Flight', train: '火车 Train', hotel: '酒店 Hotel',
  meal: '餐饮 Meal', taxi: '交通 Taxi', car_rental: '租车 Car Rental',
  fuel: '燃油 Fuel', parking: '停车 Parking', toll: '过路费 Toll',
  office_supplies: '办公用品 Office', equipment: '设备 Equipment',
  software: '软件 Software', training: '培训 Training',
  conference: '会议 Conference', courier: '快递 Courier',
  phone: '电话 Phone', internet: '网络 Internet',
  client_entertainment: '客户招待', printing: '打印 Printing',
  cloud_resource: '云资源 Cloud', ai_token: 'AI Token',
  other: '其他 Other',
};

// ============================================================================
// Component
// ============================================================================

export default function AccountingSummariesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const ts = t.accountingSummaries;

  const [activeTab, setActiveTab] = useState<'summaries' | 'details' | 'mapping'>('summaries');
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);
  const [expandedAccountCode, setExpandedAccountCode] = useState<string | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<string>('all');

  // Detail trace state
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null);

  // Edit mapping state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editAccountCode, setEditAccountCode] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);

  const fetchSummaries = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/internal/accounting-summaries');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setSummaries(data.summaries || []);
      }
    } catch (error) {
      console.error('Failed to fetch summaries:', error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  // Get unique periods for filter
  const periods = [...new Set(summaries.map(s => s.summary_id))];

  // Filtered summaries
  const filteredSummaries = filterPeriod === 'all'
    ? summaries
    : summaries.filter(s => s.summary_id === filterPeriod);

  // Save mapping handler
  const handleSaveMapping = async (itemId: string) => {
    const account = AVAILABLE_ACCOUNTS.find(a => a.code === editAccountCode);
    if (!account) return;

    setSavingMapping(true);
    try {
      const res = await fetch('/api/internal/update-item-account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          account_code: account.code,
          account_name: account.name,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setEditingItemId(null);
        setEditAccountCode('');
        // Refresh data
        await fetchSummaries();
      } else {
        alert(ts.mappingFailed);
      }
    } catch {
      alert(ts.mappingFailed);
    } finally {
      setSavingMapping(false);
    }
  };

  // ============================================================================
  // Render helpers
  // ============================================================================

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    const sym = currency === 'CNY' ? '¥' : '$';
    return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const parsePeriodLabel = (summaryId: string) => {
    // REIMB-SUM-202603-A
    const parts = summaryId.split('-');
    const ym = parts[2]; // 202603
    const half = parts[3]; // A or B
    const year = ym.substring(0, 4);
    const month = ym.substring(4, 6);
    const label = half === 'A' ? ts.halfMonthA : ts.halfMonthB;
    return `${year}/${month} ${label}`;
  };

  // ============================================================================
  // Tab: Summaries
  // ============================================================================

  const renderSummariesTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{ts.filterPeriod}:</label>
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
            backgroundColor: 'white',
          }}
        >
          <option value="all">{ts.filterAll}</option>
          {periods.map(p => (
            <option key={p} value={p}>{parsePeriodLabel(p)}</option>
          ))}
        </select>
        <button
          onClick={fetchSummaries}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #d1d5db',
            backgroundColor: 'white',
            fontSize: '0.875rem',
            cursor: 'pointer',
            color: '#374151',
          }}
        >
          {ts.refreshData}
        </button>
      </div>

      {filteredSummaries.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#9ca3af',
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
          {ts.noSummaries}
        </div>
      ) : (
        filteredSummaries.map(summary => (
          <div key={summary.summary_id} style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}>
            {/* Summary header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                backgroundColor: expandedSummaryId === summary.summary_id ? '#f8fafc' : 'white',
              }}
              onClick={() => setExpandedSummaryId(
                expandedSummaryId === summary.summary_id ? null : summary.summary_id
              )}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.625rem',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}>
                  {summary.summary_id}
                </span>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {summary.period_start} ~ {summary.period_end}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {ts.itemCount.replace('{count}', String(summary.total_records))}
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                  {formatCurrency(summary.total_amount, summary.currency)}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {expandedSummaryId === summary.summary_id ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Expanded: account breakdown */}
            {expandedSummaryId === summary.summary_id && (
              <div style={{ borderTop: '1px solid #e5e7eb' }}>
                {summary.items.map(item => (
                  <div key={item.account_code}>
                    {/* Account row */}
                    <div
                      style={{
                        padding: '0.75rem 1.25rem',
                        display: 'grid',
                        gridTemplateColumns: '100px 1fr 100px 120px 80px',
                        alignItems: 'center',
                        gap: '0.75rem',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        backgroundColor: expandedAccountCode === `${summary.summary_id}::${item.account_code}` ? '#fafbfc' : 'transparent',
                      }}
                      onClick={() => setExpandedAccountCode(
                        expandedAccountCode === `${summary.summary_id}::${item.account_code}`
                          ? null
                          : `${summary.summary_id}::${item.account_code}`
                      )}
                    >
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#7c3aed',
                      }}>
                        {item.account_code}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                        {item.account_name}
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: '#6b7280', textAlign: 'center' }}>
                        {item.record_count} records
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', textAlign: 'right' }}>
                        {formatCurrency(item.total_amount)}
                      </span>
                      <div style={{ textAlign: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSummary(summary);
                            setActiveTab('details');
                          }}
                          style={{
                            fontSize: '0.75rem',
                            color: '#2563eb',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {ts.expandDetails}
                        </button>
                      </div>
                    </div>

                    {/* Expanded: detail rows */}
                    {expandedAccountCode === `${summary.summary_id}::${item.account_code}` && (
                      <div style={{ backgroundColor: '#f9fafb' }}>
                        {/* Detail header */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 0.8fr 1fr 80px 1.5fr 120px',
                          padding: '0.5rem 1.25rem 0.5rem 2.5rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#9ca3af',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em',
                        }}>
                          <span>{ts.employee}</span>
                          <span>{ts.department}</span>
                          <span>{ts.category}</span>
                          <span style={{ textAlign: 'right' }}>{ts.amount}</span>
                          <span>{ts.descriptionLabel}</span>
                          <span style={{ textAlign: 'center' }}>{ts.currentMapping}</span>
                        </div>
                        {item.details.map((detail, idx) => (
                          <div key={idx} style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 0.8fr 1fr 80px 1.5fr 120px',
                            padding: '0.5rem 1.25rem 0.5rem 2.5rem',
                            fontSize: '0.8125rem',
                            borderTop: '1px solid #f3f4f6',
                            alignItems: 'center',
                          }}>
                            <span style={{ color: '#374151' }}>{detail.employee_name}</span>
                            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{detail.department}</span>
                            <span style={{ color: '#6b7280' }}>
                              {CATEGORY_LABELS[detail.category] || detail.category}
                            </span>
                            <span style={{ textAlign: 'right', fontWeight: 500, color: '#111827' }}>
                              {formatCurrency(detail.amount)}
                            </span>
                            <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {detail.description}
                            </span>
                            <div style={{ textAlign: 'center' }}>
                              {editingItemId === detail.item_id ? (
                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                  <select
                                    value={editAccountCode}
                                    onChange={(e) => setEditAccountCode(e.target.value)}
                                    style={{
                                      fontSize: '0.75rem',
                                      padding: '0.125rem 0.25rem',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #d1d5db',
                                      width: '70px',
                                    }}
                                  >
                                    <option value="">--</option>
                                    {['R&D', 'S&M', 'G&A'].map(g => (
                                      <optgroup key={g} label={g}>
                                        {AVAILABLE_ACCOUNTS.filter(a => a.group === g).map(a => (
                                          <option key={a.code} value={a.code}>{a.code} {a.name.split(' - ')[1]}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleSaveMapping(detail.item_id)}
                                    disabled={!editAccountCode || savingMapping}
                                    style={{
                                      fontSize: '0.625rem',
                                      padding: '0.125rem 0.375rem',
                                      borderRadius: '0.25rem',
                                      border: 'none',
                                      backgroundColor: editAccountCode ? '#2563eb' : '#d1d5db',
                                      color: 'white',
                                      cursor: editAccountCode ? 'pointer' : 'default',
                                    }}
                                  >
                                    {savingMapping ? '...' : '✓'}
                                  </button>
                                  <button
                                    onClick={() => { setEditingItemId(null); setEditAccountCode(''); }}
                                    style={{
                                      fontSize: '0.625rem',
                                      padding: '0.125rem 0.375rem',
                                      borderRadius: '0.25rem',
                                      border: '1px solid #d1d5db',
                                      backgroundColor: 'white',
                                      cursor: 'pointer',
                                      color: '#6b7280',
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingItemId(detail.item_id);
                                    setEditAccountCode(detail.account_code);
                                  }}
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#6b7280',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                  title={ts.editMapping}
                                >
                                  {detail.account_code} ✏️
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  // ============================================================================
  // Tab: Detail Trace
  // ============================================================================

  const renderDetailsTab = () => {
    const summary = selectedSummary || (filteredSummaries.length > 0 ? filteredSummaries[0] : null);

    if (!summary) {
      return (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#9ca3af',
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
          {ts.noSummaries}
        </div>
      );
    }

    // Collect all details from this summary
    const allDetails: SummaryDetail[] = [];
    for (const item of summary.items) {
      allDetails.push(...item.details);
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Summary selector */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>{ts.period}:</label>
          <select
            value={summary.summary_id}
            onChange={(e) => {
              const s = summaries.find(s => s.summary_id === e.target.value);
              if (s) setSelectedSummary(s);
            }}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              backgroundColor: 'white',
            }}
          >
            {summaries.map(s => (
              <option key={s.summary_id} value={s.summary_id}>{parsePeriodLabel(s.summary_id)}</option>
            ))}
          </select>
        </div>

        {/* Summary overview card */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{ts.summaryId}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }}>{summary.summary_id}</div>
          </div>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{ts.period}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{summary.period_start} ~ {summary.period_end}</div>
          </div>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{ts.totalRecords}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>{summary.total_records}</div>
          </div>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{ts.totalAmount}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
              {formatCurrency(summary.total_amount, summary.currency)}
            </div>
          </div>
        </div>

        {/* Account breakdown */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb',
            fontWeight: 600,
            fontSize: '0.9375rem',
            color: '#111827',
          }}>
            {ts.originalItems}
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 0.8fr 1fr 80px 1.5fr 130px',
            padding: '0.625rem 1.25rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#9ca3af',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            borderBottom: '1px solid #f3f4f6',
            backgroundColor: '#fafbfc',
          }}>
            <span>{ts.accountCode}</span>
            <span>{ts.employee}</span>
            <span>{ts.department}</span>
            <span>{ts.category}</span>
            <span style={{ textAlign: 'right' }}>{ts.amount}</span>
            <span>{ts.descriptionLabel}</span>
            <span style={{ textAlign: 'center' }}>{ts.currentMapping}</span>
          </div>

          {/* Table rows */}
          {allDetails.map((detail, idx) => (
            <div key={idx} style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 0.8fr 1fr 80px 1.5fr 130px',
              padding: '0.625rem 1.25rem',
              fontSize: '0.8125rem',
              borderBottom: '1px solid #f3f4f6',
              alignItems: 'center',
            }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#7c3aed',
              }}>
                {detail.account_code}
              </span>
              <span style={{ color: '#374151' }}>{detail.employee_name}</span>
              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{detail.department}</span>
              <span style={{ color: '#6b7280' }}>
                {CATEGORY_LABELS[detail.category] || detail.category}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 500, color: '#111827' }}>
                {formatCurrency(detail.amount)}
              </span>
              <span style={{
                color: '#6b7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {detail.description}
              </span>
              <div style={{ textAlign: 'center' }}>
                {editingItemId === detail.item_id ? (
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', justifyContent: 'center' }}>
                    <select
                      value={editAccountCode}
                      onChange={(e) => setEditAccountCode(e.target.value)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.125rem 0.25rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #d1d5db',
                        width: '75px',
                      }}
                    >
                      <option value="">--</option>
                      {['R&D', 'S&M', 'G&A'].map(g => (
                        <optgroup key={g} label={g}>
                          {AVAILABLE_ACCOUNTS.filter(a => a.group === g).map(a => (
                            <option key={a.code} value={a.code}>{a.code} {a.name.split(' - ')[1]}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSaveMapping(detail.item_id)}
                      disabled={!editAccountCode || savingMapping}
                      style={{
                        fontSize: '0.625rem',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        border: 'none',
                        backgroundColor: editAccountCode ? '#2563eb' : '#d1d5db',
                        color: 'white',
                        cursor: editAccountCode ? 'pointer' : 'default',
                      }}
                    >
                      {savingMapping ? '...' : '✓'}
                    </button>
                    <button
                      onClick={() => { setEditingItemId(null); setEditAccountCode(''); }}
                      style={{
                        fontSize: '0.625rem',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        border: '1px solid #d1d5db',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        color: '#6b7280',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingItemId(detail.item_id);
                      setEditAccountCode(detail.account_code);
                    }}
                    style={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    title={ts.editMapping}
                  >
                    {detail.account_code} - {detail.account_name.split(' - ')[1] || detail.account_name} ✏️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================================
  // Tab: Mapping Rules
  // ============================================================================

  const renderMappingTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: 600,
          fontSize: '0.9375rem',
          color: '#111827',
        }}>
          {ts.mappingRules}
        </div>

        {/* Table header */}
        {/* Table header: expense type → R&D / S&M / G&A codes */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr',
          padding: '0.625rem 1.25rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#9ca3af',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
          borderBottom: '1px solid #f3f4f6',
          backgroundColor: '#fafbfc',
        }}>
          <span>{ts.ruleCategory}</span>
          <span>Categories</span>
          <span style={{ textAlign: 'center', color: '#2563eb' }}>R&D</span>
          <span style={{ textAlign: 'center', color: '#059669' }}>S&M</span>
          <span style={{ textAlign: 'center', color: '#7c3aed' }}>G&A</span>
        </div>

        {/* Rules */}
        {MAPPING_RULES_DISPLAY.map((rule, idx) => (
          <div key={idx} style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr',
            padding: '0.75rem 1.25rem',
            fontSize: '0.8125rem',
            borderBottom: '1px solid #f3f4f6',
            alignItems: 'center',
          }}>
            <span style={{ color: '#374151', fontWeight: 500 }}>{rule.expenseType}</span>
            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{rule.categories}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2563eb', textAlign: 'center' }}>{rule.rdCode}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#059669', textAlign: 'center' }}>{rule.smCode}</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed', textAlign: 'center' }}>{rule.gaCode}</span>
          </div>
        ))}

        {/* Department classification legend */}
        <div style={{
          padding: '0.75rem 1.25rem',
          backgroundColor: '#fafbfc',
          borderTop: '1px solid #e5e7eb',
          fontSize: '0.75rem',
          color: '#6b7280',
        }}>
          <strong>部门 → 费用性质：</strong>
          <span style={{ color: '#2563eb', marginLeft: '0.5rem' }}>R&D</span> = 研发/技术/工程/产品/数据/AI
          <span style={{ color: '#059669', marginLeft: '0.75rem' }}>S&M</span> = 销售/市场/商务/增长/客户成功
          <span style={{ color: '#7c3aed', marginLeft: '0.75rem' }}>G&A</span> = 其他部门（默认）
        </div>
      </div>

      {/* Available accounts by group */}
      {['R&D', 'S&M', 'G&A'].map(group => {
        const groupAccounts = AVAILABLE_ACCOUNTS.filter(a => a.group === group);
        const groupColors: Record<string, string> = { 'R&D': '#2563eb', 'S&M': '#059669', 'G&A': '#7c3aed' };
        const groupLabels: Record<string, string> = { 'R&D': '研发费用 R&D', 'S&M': '销售费用 S&M', 'G&A': '管理费用 G&A' };
        return (
          <div key={group} style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '0.75rem 1.25rem',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: groupColors[group],
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: groupColors[group],
              }} />
              {groupLabels[group]}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem', padding: '0.75rem 1.25rem' }}>
              {groupAccounts.map(account => (
                <div key={account.code} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.375rem 0.625rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.375rem',
                  border: '1px solid #f3f4f6',
                }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: groupColors[group],
                  }}>
                    {account.code}
                  </span>
                  <span style={{ fontSize: '0.8125rem', color: '#374151' }}>
                    {account.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ============================================================================
  // Main render
  // ============================================================================

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
          {t.common.loading}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          {ts.title}
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {ts.description}
        </p>
      </div>

      {/* Stats overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '1rem 1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            {ts.period}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>
            {summaries.length}
          </div>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '1rem 1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            {ts.totalRecords}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            {summaries.reduce((sum, s) => sum + s.total_records, 0)}
          </div>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '1rem 1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            {ts.totalAmount}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
            {formatCurrency(summaries.reduce((sum, s) => sum + s.total_amount, 0))}
          </div>
        </div>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          padding: '1rem 1.25rem',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            GL {ts.accountCode}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed' }}>
            {new Set(summaries.flatMap(s => s.items.map(i => i.account_code))).size}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb' }}>
        {(['summaries', 'details', 'mapping'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#2563eb' : '#6b7280',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-2px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'summaries' ? ts.tabSummaries : tab === 'details' ? ts.tabDetails : ts.tabMapping}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'summaries' && renderSummariesTab()}
      {activeTab === 'details' && renderDetailsTab()}
      {activeTab === 'mapping' && renderMappingTab()}
    </div>
  );
}
