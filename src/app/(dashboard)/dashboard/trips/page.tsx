'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface ItineraryItem {
  id: string;
  date: string;
  time?: string;
  type: string;
  category?: string;
  title: string;
  description?: string;
  location?: string;
  departure?: string;
  arrival?: string;
  transportNumber?: string;
  hotelName?: string;
  checkIn?: string;
  checkOut?: string;
  amount?: number;
  currency?: string;
  receiptUrl?: string;
  sortOrder: number;
}

interface TripItinerary {
  id: string;
  reimbursementId?: string;
  tripId?: string;
  title: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  destinations?: string[];
  status: 'draft' | 'confirmed' | 'modified';
  aiGenerated: boolean;
  items: ItineraryItem[];
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { bg: string; text: string; label: string; labelEn: string }> = {
  draft: { bg: '#f3f4f6', text: '#6b7280', label: '草稿', labelEn: 'Draft' },
  confirmed: { bg: '#dcfce7', text: '#16a34a', label: '已确认', labelEn: 'Confirmed' },
  modified: { bg: '#fef3c7', text: '#d97706', label: '已修改', labelEn: 'Modified' },
};

const typeIcons: Record<string, string> = {
  transport: '🚆',
  hotel: '🏨',
  meal: '🍽️',
  meeting: '📋',
  other: '📌',
};

const categoryIcons: Record<string, string> = {
  flight: '✈️',
  train: '🚄',
  hotel: '🏨',
  meal: '🍽️',
  taxi: '🚕',
};

export default function TripsPage() {
  const [itineraries, setItineraries] = useState<TripItinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    const fetchItineraries = async () => {
      try {
        const response = await fetch('/api/trip-itineraries');
        const result = await response.json();
        if (result.success && result.data) {
          setItineraries(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch itineraries:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchItineraries();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (language === 'en') {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
    } catch {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (language === 'en') {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return dateStr;
    }
  };

  // Group itinerary items by date
  const groupByDate = (items: ItineraryItem[]) => {
    return items.reduce((groups: Record<string, ItineraryItem[]>, item) => {
      const date = (item.date || '').split('T')[0] || 'unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
      return groups;
    }, {});
  };

  const deleteItinerary = async (id: string) => {
    if (!confirm(language === 'en' ? 'Delete this itinerary?' : '确定删除此行程单？')) return;
    try {
      const response = await fetch(`/api/trip-itineraries/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        setItineraries(prev => prev.filter(i => i.id !== id));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>{language === 'en' ? 'Loading...' : '加载中...'}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
            {language === 'en' ? 'Trip Itineraries' : '差旅行程'}
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            {language === 'en'
              ? 'AI-generated itineraries from your reimbursement submissions'
              : '根据报销内容智能生成的差旅行程单'}
          </p>
        </div>
        <Link
          href="/dashboard/reimbursements/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          + {language === 'en' ? 'New Reimbursement' : '提交报销'}
        </Link>
      </div>

      {/* Empty state */}
      {itineraries.length === 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          padding: '60px 20px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
            {language === 'en' ? 'No trip itineraries yet' : '暂无行程单'}
          </h3>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
            {language === 'en'
              ? 'When you submit travel reimbursements (flights, trains, hotels, etc.), AI will automatically generate trip itineraries for you.'
              : '提交差旅报销（机票、火车票、酒店等）时，AI 会自动为您生成差旅行程单。'}
          </p>
          <Link
            href="/dashboard/reimbursements/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {language === 'en' ? 'Submit a Travel Reimbursement' : '提交差旅报销'}
          </Link>
        </div>
      )}

      {/* Itinerary List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {itineraries.map((itinerary) => {
          const isExpanded = expandedId === itinerary.id;
          const status = statusConfig[itinerary.status] || statusConfig.draft;
          const grouped = groupByDate(itinerary.items || []);
          const itemCount = itinerary.items?.length || 0;

          return (
            <div
              key={itinerary.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s',
              }}
            >
              {/* Card Header - always visible */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : itinerary.id)}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  backgroundColor: isExpanded ? '#f9fafb' : 'white',
                  borderBottom: isExpanded ? '1px solid #e5e7eb' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}>
                    🗺️
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <h3 style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {itinerary.title}
                      </h3>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        backgroundColor: status.bg,
                        color: status.text,
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 500,
                        flexShrink: 0,
                      }}>
                        {language === 'en' ? status.labelEn : status.label}
                      </span>
                      {itinerary.aiGenerated && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 6px',
                          backgroundColor: '#f0f9ff',
                          color: '#0369a1',
                          borderRadius: '9999px',
                          fontSize: '10px',
                          fontWeight: 500,
                          flexShrink: 0,
                        }}>
                          ✨ AI
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
                      {itinerary.startDate && itinerary.endDate && (
                        <span>
                          {formatShortDate(itinerary.startDate)} ~ {formatShortDate(itinerary.endDate)}
                        </span>
                      )}
                      {itinerary.destinations && itinerary.destinations.length > 0 && (
                        <span>{itinerary.destinations.join(' → ')}</span>
                      )}
                      <span>{itemCount} {language === 'en' ? 'stops' : '个节点'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {itinerary.reimbursementId && (
                    <Link
                      href={`/dashboard/reimbursements/${itinerary.reimbursementId}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        backgroundColor: '#f0fdf4',
                        color: '#16a34a',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        textDecoration: 'none',
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      📄 {language === 'en' ? 'View Reimbursement' : '查看报销单'}
                    </Link>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteItinerary(itinerary.id); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      fontSize: '14px',
                      borderRadius: '4px',
                    }}
                    title={language === 'en' ? 'Delete' : '删除'}
                  >
                    🗑️
                  </button>
                  <span style={{
                    color: '#9ca3af',
                    fontSize: '14px',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}>
                    ▼
                  </span>
                </div>
              </div>

              {/* Expanded content - itinerary timeline */}
              {isExpanded && (
                <div style={{ padding: '20px' }}>
                  {/* Purpose */}
                  {itinerary.purpose && (
                    <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                      {language === 'en' ? 'Purpose' : '出差目的'}：{itinerary.purpose}
                    </p>
                  )}

                  {/* Timeline grouped by date */}
                  {Object.entries(grouped)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, items]) => (
                      <div key={date} style={{ marginBottom: '16px' }}>
                        {/* Day header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#2563eb',
                          }} />
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#1e40af',
                          }}>
                            {formatDate(date)}
                          </span>
                        </div>

                        {/* Items for this day */}
                        <div style={{
                          marginLeft: '4px',
                          borderLeft: '2px solid #e5e7eb',
                          paddingLeft: '16px',
                        }}>
                          {(items as ItineraryItem[])
                            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                            .map((item, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 14px',
                                  backgroundColor: '#fafafa',
                                  borderRadius: '8px',
                                  marginBottom: '8px',
                                  border: '1px solid #f3f4f6',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                  <span style={{ fontSize: '16px', marginTop: '1px' }}>
                                    {item.category
                                      ? (categoryIcons[item.category] || typeIcons[item.type] || '📌')
                                      : (typeIcons[item.type] || '📌')}
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
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
                                      <span style={{
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        color: '#111827',
                                      }}>
                                        {item.title}
                                      </span>
                                    </div>
                                    {item.description && (
                                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                        {item.description}
                                      </p>
                                    )}
                                    <div style={{
                                      display: 'flex',
                                      gap: '12px',
                                      marginTop: '4px',
                                      flexWrap: 'wrap',
                                    }}>
                                      {item.location && (
                                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                          📍 {item.location}
                                        </span>
                                      )}
                                      {item.amount && (
                                        <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 500 }}>
                                          💰 {item.currency || 'CNY'} {item.amount.toLocaleString()}
                                        </span>
                                      )}
                                      {item.receiptUrl && (
                                        <span style={{ fontSize: '11px', color: '#16a34a' }}>
                                          🧾 {language === 'en' ? 'Receipt linked' : '已关联凭证'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}

                  {/* Footer */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '12px',
                    color: '#9ca3af',
                  }}>
                    <span>
                      {language === 'en' ? 'Created' : '创建于'} {new Date(itinerary.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN')}
                    </span>
                    {itinerary.reimbursementId && (
                      <Link
                        href={`/dashboard/reimbursements/${itinerary.reimbursementId}`}
                        style={{
                          color: '#2563eb',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {language === 'en' ? 'View linked reimbursement →' : '查看关联报销单 →'}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
