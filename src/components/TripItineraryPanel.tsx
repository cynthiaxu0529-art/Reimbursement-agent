'use client';

import { useState, useCallback } from 'react';

/**
 * 差旅类别列表（仅包含这些类别的报销才需要生成行程）
 */
const TRAVEL_CATEGORIES = ['flight', 'train', 'hotel', 'meal', 'taxi', 'car_rental', 'fuel', 'parking', 'toll'];

const typeIcons: Record<string, string> = {
  transport: '🚆',
  hotel: '🏨',
  meal: '🍽️',
  meeting: '📋',
  other: '📌',
};

const typeLabels: Record<string, string> = {
  transport: '交通',
  hotel: '住宿',
  meal: '餐饮',
  meeting: '会议',
  other: '其他',
};

const categoryIcons: Record<string, string> = {
  flight: '✈️',
  train: '🚄',
  hotel: '🏨',
  meal: '🍽️',
  taxi: '🚕',
  car_rental: '🚗',
  fuel: '⛽',
  parking: '🅿️',
  toll: '🛣️',
};

interface ItineraryItem {
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
  reimbursementItemId?: string;
  receiptUrl?: string;
  sortOrder: number;
}

interface Itinerary {
  title: string;
  purpose?: string;
  startDate?: string;
  endDate?: string;
  destinations?: string[];
  items: ItineraryItem[];
}

interface LineItem {
  id: string;
  description: string;
  category: string;
  amount: string;
  currency: string;
  date: string;
  vendor?: string;
  departure?: string;
  destination?: string;
  trainNumber?: string;
  flightNumber?: string;
  seatClass?: string;
  checkInDate?: string;
  checkOutDate?: string;
  nights?: number;
  receiptUrl?: string;
}

interface TripItineraryPanelProps {
  lineItems: LineItem[];
  description: string;
  onItineraryConfirmed?: (itinerary: Itinerary) => void;
}

export default function TripItineraryPanel({
  lineItems,
  description,
  onItineraryConfirmed,
}: TripItineraryPanelProps) {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  // 检查是否包含差旅类别
  const hasTravelItems = lineItems.some(item =>
    TRAVEL_CATEGORIES.includes(item.category)
  );

  // 如果没有差旅项目，不显示面板
  if (!hasTravelItems) {
    return null;
  }

  // AI 生成行程
  const generateItinerary = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/trip-itineraries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lineItems,
          description,
        }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        setItinerary(result.data);
        setIsEditing(false);
        setIsConfirmed(false);
      } else {
        setError(result.error || result.message || '行程生成失败');
      }
    } catch (err: any) {
      console.error('Generate itinerary error:', err);
      setError('网络错误，请重试');
    } finally {
      setIsGenerating(false);
    }
  }, [lineItems, description]);

  // 确认行程
  const confirmItinerary = useCallback(async () => {
    if (!itinerary) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/trip-itineraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...itinerary,
          status: 'confirmed',
        }),
      });

      const result = await response.json();

      if (result.success) {
        setIsConfirmed(true);
        setIsEditing(false);
        onItineraryConfirmed?.(itinerary);
      } else {
        setError(result.error || '保存行程单失败');
      }
    } catch (err: any) {
      console.error('Save itinerary error:', err);
      setError('网络错误，请重试');
    } finally {
      setIsSaving(false);
    }
  }, [itinerary, onItineraryConfirmed]);

  // 编辑行程节点
  const updateItineraryItem = (index: number, field: string, value: any) => {
    if (!itinerary) return;
    const newItems = [...itinerary.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItinerary({ ...itinerary, items: newItems });
  };

  // 删除行程节点
  const removeItineraryItem = (index: number) => {
    if (!itinerary) return;
    const newItems = itinerary.items.filter((_: ItineraryItem, i: number) => i !== index);
    setItinerary({ ...itinerary, items: newItems });
  };

  // 添加行程节点
  const addItineraryItem = () => {
    if (!itinerary) return;
    const newItem: ItineraryItem = {
      date: itinerary.startDate || new Date().toISOString().split('T')[0],
      type: 'other',
      title: '',
      sortOrder: itinerary.items.length,
    };
    setItinerary({ ...itinerary, items: [...itinerary.items, newItem] });
    setEditingItemIndex(itinerary.items.length);
  };

  // 按日期分组显示行程
  const groupedItems = itinerary?.items.reduce((groups: Record<string, ItineraryItem[]>, item: ItineraryItem) => {
    const date = item.date?.split('T')[0] || '未知日期';
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
    return groups;
  }, {} as Record<string, ItineraryItem[]>);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      return `${date.getMonth() + 1}月${date.getDate()}日 周${weekdays[date.getDay()]}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden',
      marginTop: '16px',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#eff6ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🗺️</span>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1e40af' }}>
            差旅行程单
          </h3>
          {isConfirmed && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              backgroundColor: '#dcfce7',
              color: '#166534',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 500,
            }}>
              ✓ 已确认
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!itinerary && !isGenerating && (
            <button
              onClick={generateItinerary}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              ✨ AI 智能生成行程
            </button>
          )}
          {itinerary && !isConfirmed && (
            <>
              <button
                onClick={generateItinerary}
                disabled={isGenerating}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.6 : 1,
                }}
              >
                重新生成
              </button>
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'white',
                  color: '#2563eb',
                  border: '1px solid #2563eb',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {isEditing ? '完成编辑' : '编辑行程'}
              </button>
              <button
                onClick={confirmItinerary}
                disabled={isSaving}
                style={{
                  padding: '6px 14px',
                  background: isSaving ? '#9ca3af' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? '保存中...' : '确认行程'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px' }}>
        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '13px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {/* Generating state */}
        {isGenerating && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px 20px',
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '3px solid #e5e7eb',
              borderTopColor: '#2563eb',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ fontSize: '14px', color: '#2563eb', fontWeight: 500 }}>
              AI 正在分析报销内容，生成行程单...
            </p>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              根据机票、火车票、酒店等信息推断完整行程
            </p>
          </div>
        )}

        {/* Empty state (before generation) */}
        {!itinerary && !isGenerating && (
          <div style={{
            textAlign: 'center',
            padding: '30px 20px',
            color: '#6b7280',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗺️</div>
            <p style={{ fontSize: '14px', marginBottom: '4px' }}>
              检测到差旅报销项目
            </p>
            <p style={{ fontSize: '12px', color: '#9ca3af' }}>
              点击上方"AI 智能生成行程"按钮，自动生成差旅行程单
            </p>
          </div>
        )}

        {/* Itinerary display */}
        {itinerary && !isGenerating && (
          <div>
            {/* Itinerary header info */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
            }}>
              <div style={{ flex: 1 }}>
                {isEditing ? (
                  <input
                    type="text"
                    value={itinerary.title}
                    onChange={(e) => setItinerary({ ...itinerary, title: e.target.value })}
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#111827',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      width: '100%',
                      marginBottom: '4px',
                    }}
                  />
                ) : (
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                    {itinerary.title}
                  </h4>
                )}
                {itinerary.purpose && (
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    目的：{itinerary.purpose}
                  </p>
                )}
                {itinerary.destinations && itinerary.destinations.length > 0 && (
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    目的地：{itinerary.destinations.join(' → ')}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
                {itinerary.startDate && (
                  <p>{formatDate(itinerary.startDate)} ~ {itinerary.endDate ? formatDate(itinerary.endDate) : ''}</p>
                )}
                <p style={{ marginTop: '2px' }}>
                  共 {itinerary.items.length} 个行程节点
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div>
              {groupedItems && Object.entries(groupedItems)
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
                    {items
                      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                      .map((item, idx) => {
                        const globalIndex = itinerary.items.indexOf(item);
                        const isEditingThis = isEditing && editingItemIndex === globalIndex;

                        return (
                          <div
                            key={idx}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: isEditingThis ? '#eff6ff' : '#fafafa',
                              borderRadius: '8px',
                              marginBottom: '8px',
                              border: isEditingThis ? '1px solid #93c5fd' : '1px solid #f3f4f6',
                              position: 'relative',
                            }}
                          >
                            {isEditing && (
                              <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                display: 'flex',
                                gap: '4px',
                              }}>
                                <button
                                  onClick={() => setEditingItemIndex(
                                    editingItemIndex === globalIndex ? null : globalIndex
                                  )}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2563eb',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    padding: '2px 6px',
                                  }}
                                >
                                  {isEditingThis ? '收起' : '编辑'}
                                </button>
                                <button
                                  onClick={() => removeItineraryItem(globalIndex)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    padding: '2px 6px',
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            )}

                            <div style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '10px',
                            }}>
                              <span style={{ fontSize: '16px', marginTop: '1px' }}>
                                {item.category ? (categoryIcons[item.category] || typeIcons[item.type] || '📌')
                                  : (typeIcons[item.type] || '📌')}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {isEditingThis ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <input
                                      type="text"
                                      value={item.title}
                                      onChange={(e) => updateItineraryItem(globalIndex, 'title', e.target.value)}
                                      placeholder="行程标题"
                                      style={{
                                        padding: '6px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                      }}
                                    />
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <input
                                        type="time"
                                        value={item.time || ''}
                                        onChange={(e) => updateItineraryItem(globalIndex, 'time', e.target.value)}
                                        style={{
                                          padding: '4px 6px',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '4px',
                                          fontSize: '12px',
                                          width: '100px',
                                        }}
                                      />
                                      <select
                                        value={item.type}
                                        onChange={(e) => updateItineraryItem(globalIndex, 'type', e.target.value)}
                                        style={{
                                          padding: '4px 6px',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '4px',
                                          fontSize: '12px',
                                        }}
                                      >
                                        {Object.entries(typeLabels).map(([k, v]) => (
                                          <option key={k} value={k}>{v}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <input
                                      type="text"
                                      value={item.description || ''}
                                      onChange={(e) => updateItineraryItem(globalIndex, 'description', e.target.value)}
                                      placeholder="描述（可选）"
                                      style={{
                                        padding: '6px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <>
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
                                        <span style={{
                                          fontSize: '11px',
                                          color: '#16a34a',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                        }}>
                                          🧾 已关联凭证
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}

              {/* Add item button (in editing mode) */}
              {isEditing && (
                <button
                  onClick={addItineraryItem}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    padding: '10px',
                    backgroundColor: '#f9fafb',
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    color: '#6b7280',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginTop: '8px',
                  }}
                >
                  + 添加行程节点
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
