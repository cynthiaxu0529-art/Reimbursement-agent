'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const expenseCategories = [
  { value: 'flight', label: '机票', icon: '✈️' },
  { value: 'train', label: '火车票', icon: '🚄' },
  { value: 'hotel', label: '酒店住宿', icon: '🏨' },
  { value: 'meal', label: '餐饮', icon: '🍽️' },
  { value: 'taxi', label: '交通', icon: '🚕' },
  { value: 'office_supplies', label: '办公用品', icon: '📎' },
  { value: 'ai_token', label: 'AI 服务', icon: '🤖' },
  { value: 'cloud_resource', label: '云资源', icon: '☁️' },
  { value: 'client_entertainment', label: '客户招待', icon: '🤝' },
  { value: 'other', label: '其他', icon: '📦' },
];

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  location?: string;
  receiptUrl?: string;
}

export default function NewReimbursementPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [tripId, setTripId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<ExpenseItem[]>([
    {
      id: '1',
      category: '',
      description: '',
      amount: '',
      currency: 'CNY',
      date: new Date().toISOString().split('T')[0],
    },
  ]);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        category: '',
        description: '',
        amount: '',
        currency: 'CNY',
        date: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof ExpenseItem, value: string) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const handleSubmit = async (isDraft: boolean) => {
    setIsSubmitting(true);
    // TODO: 调用 API 保存
    console.log({ title, tripId, items, isDraft });
    setTimeout(() => {
      router.push('/dashboard/reimbursements');
    }, 500);
  };

  const inputStyle = {
    width: '100%',
    padding: '0.625rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: 'white'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.375rem'
  };

  const selectStyle = {
    ...inputStyle,
    height: '38px',
    cursor: 'pointer'
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Link
            href="/dashboard/reimbursements"
            style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.875rem' }}
          >
            我的报销
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#111827', fontSize: '0.875rem' }}>新建报销</span>
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem' }}>
          新建报销
        </h2>
        <p style={{ color: '#6b7280' }}>填写报销信息并上传票据</p>
      </div>

      {/* Basic Info Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        border: '1px solid #e5e7eb',
        marginBottom: '1.5rem',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>基本信息</h3>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>报销标题 *</label>
              <input
                type="text"
                placeholder="例如：上海出差报销"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>关联行程（可选）</label>
              <select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                style={selectStyle}
              >
                <option value="">不关联行程</option>
                <option value="trip1">上海客户拜访 (1/15-1/17)</option>
                <option value="trip2">北京技术培训 (1/20-1/22)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Expense Items Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        border: '1px solid #e5e7eb',
        marginBottom: '1.5rem',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>费用明细</h3>
          <button
            onClick={addItem}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.5rem 0.875rem',
              backgroundColor: 'white',
              color: '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '1rem' }}>+</span> 添加费用
          </button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          {items.map((item, index) => (
            <div
              key={item.id}
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                marginBottom: index < items.length - 1 ? '1rem' : 0,
                border: '1px solid #e5e7eb'
              }}
            >
              {/* Item Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem'
              }}>
                <span style={{ fontWeight: 600, color: '#111827' }}>费用 #{index + 1}</span>
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    <span>🗑️</span> 删除
                  </button>
                )}
              </div>

              {/* Row 1: Category, Amount, Date */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div>
                  <label style={labelStyle}>费用类别 *</label>
                  <select
                    value={item.category}
                    onChange={(e) => updateItem(item.id, 'category', e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">选择类别</option>
                    {expenseCategories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>金额 *</label>
                  <div style={{ display: 'flex' }}>
                    <select
                      value={item.currency}
                      onChange={(e) => updateItem(item.id, 'currency', e.target.value)}
                      style={{
                        padding: '0.625rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRight: 'none',
                        borderRadius: '0.5rem 0 0 0.5rem',
                        fontSize: '0.875rem',
                        backgroundColor: '#f3f4f6',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="CNY">¥</option>
                      <option value="USD">$</option>
                      <option value="EUR">€</option>
                    </select>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={(e) => updateItem(item.id, 'amount', e.target.value)}
                      style={{
                        ...inputStyle,
                        borderRadius: '0 0.5rem 0.5rem 0',
                        flex: 1
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>日期 *</label>
                  <input
                    type="date"
                    value={item.date}
                    onChange={(e) => updateItem(item.id, 'date', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Row 2: Description, Location */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div>
                  <label style={labelStyle}>费用说明 *</label>
                  <input
                    type="text"
                    placeholder="例如：往返机票"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>消费地点（可选）</label>
                  <input
                    type="text"
                    placeholder="例如：上海"
                    value={item.location || ''}
                    onChange={(e) => updateItem(item.id, 'location', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Receipt Upload */}
              <div>
                <label style={labelStyle}>上传票据</label>
                <div style={{
                  border: '2px dashed #d1d5db',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  transition: 'border-color 0.2s'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    点击或拖拽上传发票/收据
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    支持 JPG, PNG, PDF 格式
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary & Actions */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        border: '1px solid #e5e7eb',
        padding: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>费用合计</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>
            ¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            共 {items.length} 笔费用
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => router.push('/dashboard/reimbursements')}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: 'white',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: 'white',
              color: '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1
            }}
          >
            保存草稿
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting || !title}
            style={{
              padding: '0.625rem 1.25rem',
              background: isSubmitting || !title ? '#9ca3af' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: isSubmitting || !title ? 'not-allowed' : 'pointer'
            }}
          >
            {isSubmitting ? '提交中...' : '提交审批'}
          </button>
        </div>
      </div>
    </div>
  );
}
