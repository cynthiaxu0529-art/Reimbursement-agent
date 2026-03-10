'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

// ==================== Types ====================

interface Trip {
  id: string;
  title: string;
  purpose?: string;
  destination?: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'ongoing' | 'completed' | 'cancelled';
  budget?: any;
  createdAt: string;
  itineraries?: TripItinerary[];
}

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

// ==================== Constants ====================

const tripStatusConfig: Record<string, { bg: string; text: string; label: string; labelEn: string }> = {
  planning: { bg: '#eff6ff', text: '#2563eb', label: '计划中', labelEn: 'Planning' },
  ongoing: { bg: '#fef3c7', text: '#d97706', label: '进行中', labelEn: 'Ongoing' },
  completed: { bg: '#dcfce7', text: '#16a34a', label: '已完成', labelEn: 'Completed' },
  cancelled: { bg: '#f3f4f6', text: '#6b7280', label: '已取消', labelEn: 'Cancelled' },
};

const itineraryStatusConfig: Record<string, { bg: string; text: string; label: string; labelEn: string }> = {
  draft: { bg: '#f3f4f6', text: '#6b7280', label: '草稿', labelEn: 'Draft' },
  confirmed: { bg: '#dcfce7', text: '#16a34a', label: '已确认', labelEn: 'Confirmed' },
  modified: { bg: '#fef3c7', text: '#d97706', label: '已修改', labelEn: 'Modified' },
};

const categoryIcons: Record<string, string> = {
  flight: '✈️', train: '🚄', hotel: '🏨', meal: '🍽️', taxi: '🚕',
  transport: '🚆', meeting: '📋', other: '📌',
};

// ==================== Main Component ====================

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [itineraries, setItineraries] = useState<TripItinerary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'trips' | 'itineraries'>('trips');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t, language } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tripsRes, itinerariesRes] = await Promise.all([
          fetch('/api/trips'),
          fetch('/api/trip-itineraries'),
        ]);

        if (tripsRes.ok) {
          const tripsJson = await tripsRes.json();
          if (tripsJson.success) setTrips(tripsJson.data || []);
        }
        if (itinerariesRes.ok) {
          const itJson = await itinerariesRes.json();
          if (itJson.success) setItineraries(itJson.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch trips data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return language === 'en'
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    } catch { return dateStr; }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return language === 'en'
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `${d.getMonth() + 1}/${d.getDate()}`;
    } catch { return dateStr; }
  };

  const deleteTrip = async (id: string) => {
    if (!confirm(language === 'en' ? 'Delete this trip?' : '确定删除此行程？')) return;
    try {
      const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' });
      if (res.ok) setTrips(prev => prev.filter(t => t.id !== id));
    } catch (error) { console.error('Delete trip failed:', error); }
  };

  const deleteItinerary = async (id: string) => {
    if (!confirm(language === 'en' ? 'Delete this itinerary?' : '确定删除此行程单？')) return;
    try {
      const res = await fetch(`/api/trip-itineraries/${id}`, { method: 'DELETE' });
      if (res.ok) setItineraries(prev => prev.filter(i => i.id !== id));
    } catch (error) { console.error('Delete itinerary failed:', error); }
  };

  const updateTripStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setTrips(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      }
    } catch (error) { console.error('Update trip failed:', error); }
  };

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const syncCalendar = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/trips/calendar-sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.data.created > 0) {
          setTrips(prev => [...data.data.trips, ...prev]);
          setSyncMessage(language === 'en'
            ? `Found ${data.data.travelEvents} travel events, created ${data.data.created} new trips`
            : `发现 ${data.data.travelEvents} 个差旅事件，创建了 ${data.data.created} 个新行程`);
        } else {
          setSyncMessage(data.message || (language === 'en' ? 'No new travel events found' : '未发现新的差旅事件'));
        }
      } else {
        if (data.code === 'NO_GOOGLE_ACCOUNT') {
          setSyncMessage(language === 'en'
            ? 'Please sign in with Google to sync calendar'
            : '请使用 Google 账号登录以同步日历');
        } else {
          setSyncMessage(data.error || 'Sync failed');
        }
      }
    } catch {
      setSyncMessage(language === 'en' ? 'Sync failed' : '同步失败');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const groupByDate = (items: ItineraryItem[]) => {
    return items.reduce((groups: Record<string, ItineraryItem[]>, item) => {
      const date = (item.date || '').split('T')[0] || 'unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
      return groups;
    }, {});
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
            {language === 'en' ? 'Trips & Itineraries' : '差旅行程'}
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            {language === 'en'
              ? 'Plan trips ahead or view AI-generated itineraries from reimbursements'
              : '提前规划差旅行程，或查看报销生成的行程单'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={syncCalendar}
            disabled={syncing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px',
              backgroundColor: syncing ? '#f3f4f6' : 'white',
              color: syncing ? '#9ca3af' : '#374151',
              border: '1px solid #d1d5db', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            📅 {syncing
              ? (language === 'en' ? 'Syncing...' : '同步中...')
              : (language === 'en' ? 'Sync Calendar' : '同步日历')}
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            }}
          >
            + {language === 'en' ? 'New Trip' : '新建行程'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', backgroundColor: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
        <button
          onClick={() => setActiveTab('trips')}
          style={{
            flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '14px', fontWeight: 500,
            backgroundColor: activeTab === 'trips' ? 'white' : 'transparent',
            color: activeTab === 'trips' ? '#111827' : '#6b7280',
            boxShadow: activeTab === 'trips' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {language === 'en' ? 'My Trips' : '我的行程'} ({trips.length})
        </button>
        <button
          onClick={() => setActiveTab('itineraries')}
          style={{
            flex: 1, padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            fontSize: '14px', fontWeight: 500,
            backgroundColor: activeTab === 'itineraries' ? 'white' : 'transparent',
            color: activeTab === 'itineraries' ? '#111827' : '#6b7280',
            boxShadow: activeTab === 'itineraries' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          {language === 'en' ? 'AI Itineraries' : 'AI 行程单'} ({itineraries.length})
        </button>
      </div>

      {/* Sync message */}
      {syncMessage && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
        }}>
          📅 {syncMessage}
        </div>
      )}

      {/* Create Trip Modal */}
      {showCreateForm && (
        <CreateTripForm
          language={language}
          onClose={() => setShowCreateForm(false)}
          onCreated={(trip) => {
            setTrips(prev => [trip, ...prev]);
            setShowCreateForm(false);
          }}
        />
      )}

      {/* Trips Tab */}
      {activeTab === 'trips' && (
        <>
          {trips.length === 0 ? (
            <EmptyState
              icon="🗺️"
              title={language === 'en' ? 'No trips planned yet' : '暂无行程计划'}
              description={language === 'en'
                ? 'Create a trip before your business travel to plan ahead, get booking reminders, and easily submit reimbursements after.'
                : '出差前创建行程计划，获取订票提醒，差旅结束后轻松提交报销。'}
              actionLabel={language === 'en' ? 'Plan a New Trip' : '创建行程计划'}
              onAction={() => setShowCreateForm(true)}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {trips.map((trip) => {
                const status = tripStatusConfig[trip.status] || tripStatusConfig.planning;
                const daysUntil = Math.ceil((new Date(trip.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const isUpcoming = trip.status === 'planning' && daysUntil > 0 && daysUntil <= 7;

                return (
                  <div key={trip.id} style={{
                    backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    borderLeft: isUpcoming ? '4px solid #f59e0b' : undefined,
                  }}>
                    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <div style={{
                          width: '44px', height: '44px', borderRadius: '10px',
                          backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
                        }}>
                          {trip.status === 'completed' ? '✅' : trip.status === 'ongoing' ? '🚀' : '📋'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{trip.title}</h3>
                            <span style={{
                              padding: '2px 8px', backgroundColor: status.bg, color: status.text,
                              borderRadius: '9999px', fontSize: '11px', fontWeight: 500,
                            }}>
                              {language === 'en' ? status.labelEn : status.label}
                            </span>
                            {isUpcoming && (
                              <span style={{
                                padding: '2px 8px', backgroundColor: '#fef3c7', color: '#92400e',
                                borderRadius: '9999px', fontSize: '11px', fontWeight: 500,
                              }}>
                                ⏰ {language === 'en' ? `${daysUntil}d away` : `${daysUntil}天后出发`}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280' }}>
                            {trip.destination && <span>📍 {trip.destination}</span>}
                            <span>📅 {formatShortDate(trip.startDate)} ~ {formatShortDate(trip.endDate)}</span>
                            {trip.purpose && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{trip.purpose}</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {trip.status === 'planning' && (
                          <button
                            onClick={() => updateTripStatus(trip.id, 'ongoing')}
                            style={{
                              padding: '6px 12px', backgroundColor: '#eff6ff', color: '#2563eb',
                              border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px',
                              fontWeight: 500, cursor: 'pointer',
                            }}
                          >
                            {language === 'en' ? 'Start Trip' : '开始出差'}
                          </button>
                        )}
                        {trip.status === 'ongoing' && (
                          <>
                            <button
                              onClick={() => updateTripStatus(trip.id, 'completed')}
                              style={{
                                padding: '6px 12px', backgroundColor: '#f0fdf4', color: '#16a34a',
                                border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px',
                                fontWeight: 500, cursor: 'pointer',
                              }}
                            >
                              {language === 'en' ? 'Complete' : '完成出差'}
                            </button>
                            <Link
                              href={`/dashboard/reimbursements/new?tripId=${trip.id}&title=${encodeURIComponent(trip.title)}`}
                              style={{
                                padding: '6px 12px', backgroundColor: '#faf5ff', color: '#7c3aed',
                                border: '1px solid #e9d5ff', borderRadius: '6px', fontSize: '12px',
                                fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
                              }}
                            >
                              {language === 'en' ? 'Submit Expenses' : '提交报销'}
                            </Link>
                          </>
                        )}
                        {trip.status === 'completed' && (
                          <Link
                            href={`/dashboard/reimbursements/new?tripId=${trip.id}&title=${encodeURIComponent(trip.title)}`}
                            style={{
                              padding: '6px 12px', backgroundColor: '#f0fdf4', color: '#16a34a',
                              border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px',
                              fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
                            }}
                          >
                            {language === 'en' ? 'Create Reimbursement' : '创建报销'}
                          </Link>
                        )}
                        <button
                          onClick={() => deleteTrip(trip.id)}
                          style={{
                            background: 'none', border: 'none', color: '#9ca3af',
                            cursor: 'pointer', padding: '4px 8px', fontSize: '14px', borderRadius: '4px',
                          }}
                          title={language === 'en' ? 'Delete' : '删除'}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Itineraries Tab */}
      {activeTab === 'itineraries' && (
        <>
          {itineraries.length === 0 ? (
            <EmptyState
              icon="✨"
              title={language === 'en' ? 'No AI itineraries yet' : '暂无 AI 行程单'}
              description={language === 'en'
                ? 'When you submit travel reimbursements (flights, trains, hotels, etc.), AI will automatically generate trip itineraries for you.'
                : '提交差旅报销（机票、火车票、酒店等）时，AI 会自动为您生成差旅行程单。'}
              actionLabel={language === 'en' ? 'Submit a Travel Reimbursement' : '提交差旅报销'}
              actionHref="/dashboard/reimbursements/new"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {itineraries.map((itinerary) => {
                const isExpanded = expandedId === itinerary.id;
                const status = itineraryStatusConfig[itinerary.status] || itineraryStatusConfig.draft;
                const grouped = groupByDate(itinerary.items || []);
                const itemCount = itinerary.items?.length || 0;

                return (
                  <div key={itinerary.id} style={{
                    backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden',
                  }}>
                    {/* Header */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : itinerary.id)}
                      style={{
                        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', backgroundColor: isExpanded ? '#f9fafb' : 'white',
                        borderBottom: isExpanded ? '1px solid #e5e7eb' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '10px',
                          backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                        }}>🗺️</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {itinerary.title}
                            </h3>
                            <span style={{ padding: '2px 8px', backgroundColor: status.bg, color: status.text, borderRadius: '9999px', fontSize: '11px', fontWeight: 500, flexShrink: 0 }}>
                              {language === 'en' ? status.labelEn : status.label}
                            </span>
                            {itinerary.aiGenerated && (
                              <span style={{ padding: '2px 6px', backgroundColor: '#f0f9ff', color: '#0369a1', borderRadius: '9999px', fontSize: '10px', fontWeight: 500, flexShrink: 0 }}>
                                ✨ AI
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6b7280' }}>
                            {itinerary.startDate && itinerary.endDate && (
                              <span>{formatShortDate(itinerary.startDate)} ~ {formatShortDate(itinerary.endDate)}</span>
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
                              padding: '4px 10px', backgroundColor: '#f0fdf4', color: '#16a34a',
                              borderRadius: '6px', fontSize: '11px', fontWeight: 500, textDecoration: 'none', border: '1px solid #bbf7d0',
                            }}
                          >
                            📄 {language === 'en' ? 'Reimbursement' : '报销单'}
                          </Link>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteItinerary(itinerary.id); }}
                          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px 8px', fontSize: '14px' }}
                        >🗑️</button>
                        <span style={{ color: '#9ca3af', fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                      </div>
                    </div>

                    {/* Expanded timeline */}
                    {isExpanded && (
                      <div style={{ padding: '20px' }}>
                        {itinerary.purpose && (
                          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                            {language === 'en' ? 'Purpose' : '出差目的'}：{itinerary.purpose}
                          </p>
                        )}
                        {Object.entries(grouped)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([date, items]) => (
                            <div key={date} style={{ marginBottom: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>{formatDate(date)}</span>
                              </div>
                              <div style={{ marginLeft: '4px', borderLeft: '2px solid #e5e7eb', paddingLeft: '16px' }}>
                                {(items as ItineraryItem[]).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((item, idx) => (
                                  <div key={idx} style={{ padding: '10px 14px', backgroundColor: '#fafafa', borderRadius: '8px', marginBottom: '8px', border: '1px solid #f3f4f6' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                      <span style={{ fontSize: '16px', marginTop: '1px' }}>
                                        {categoryIcons[item.category || ''] || categoryIcons[item.type] || '📌'}
                                      </span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {item.time && (
                                            <span style={{ fontSize: '11px', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>{item.time}</span>
                                          )}
                                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>{item.title}</span>
                                        </div>
                                        {item.description && <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{item.description}</p>}
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                                          {item.location && <span style={{ fontSize: '11px', color: '#9ca3af' }}>📍 {item.location}</span>}
                                          {item.amount && <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 500 }}>💰 {item.currency || 'CNY'} {item.amount.toLocaleString()}</span>}
                                          {item.receiptUrl && <span style={{ fontSize: '11px', color: '#16a34a' }}>🧾 {language === 'en' ? 'Receipt' : '凭证'}</span>}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '12px', color: '#9ca3af' }}>
                          <span>{language === 'en' ? 'Created' : '创建于'} {new Date(itinerary.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN')}</span>
                          {itinerary.reimbursementId && (
                            <Link href={`/dashboard/reimbursements/${itinerary.reimbursementId}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                              {language === 'en' ? 'View reimbursement →' : '查看报销单 →'}
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== Sub-Components ====================

function EmptyState({ icon, title, description, actionLabel, onAction, actionHref }: {
  icon: string; title: string; description: string; actionLabel: string;
  onAction?: () => void; actionHref?: string;
}) {
  return (
    <div style={{
      backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb',
      padding: '60px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>{description}</p>
      {actionHref ? (
        <Link href={actionHref} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
        }}>
          {actionLabel}
        </Link>
      ) : (
        <button onClick={onAction} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 24px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function CreateTripForm({ language, onClose, onCreated }: {
  language: string;
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDate || !endDate) {
      setError(language === 'en' ? 'Title, start date and end date are required' : '标题、开始和结束日期为必填');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, purpose, destination, startDate, endDate }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.data);
      } else {
        setError(data.error || 'Failed');
      }
    } catch {
      setError(language === 'en' ? 'Network error' : '网络错误');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    display: 'block', fontSize: '13px', fontWeight: 500 as const, color: '#374151', marginBottom: '6px',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: '16px', padding: '28px',
        width: '100%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
            {language === 'en' ? 'Plan a New Trip' : '新建行程计划'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>{language === 'en' ? 'Trip Title *' : '行程标题 *'}</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'en' ? 'e.g. Shanghai → Beijing Business Trip' : '如：上海-北京出差'}
              style={inputStyle} required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>{language === 'en' ? 'Destination' : '目的地'}</label>
            <input
              value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder={language === 'en' ? 'e.g. Beijing' : '如：北京'}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{language === 'en' ? 'Start Date *' : '开始日期 *'}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{language === 'en' ? 'End Date *' : '结束日期 *'}</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>{language === 'en' ? 'Purpose' : '出差目的'}</label>
            <textarea
              value={purpose} onChange={(e) => setPurpose(e.target.value)}
              placeholder={language === 'en' ? 'e.g. Client meeting, tech conference...' : '如：客户会议、技术大会...'}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '10px', backgroundColor: '#f3f4f6', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            }}>
              {language === 'en' ? 'Cancel' : '取消'}
            </button>
            <button type="submit" disabled={saving} style={{
              flex: 1, padding: '10px',
              background: saving ? '#9ca3af' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? (language === 'en' ? 'Creating...' : '创建中...') : (language === 'en' ? 'Create Trip' : '创建行程')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
