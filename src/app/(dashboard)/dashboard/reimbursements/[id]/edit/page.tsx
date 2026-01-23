'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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

interface LineItem {
  id: string;
  description: string;
  category: string;
  amount: string;
  currency: string;
  date: string;
  receiptUrl?: string;
  vendor?: string;
  exchangeRate?: number;
  amountInUSD?: number;
}

// 支持的币种
const currencies = [
  { code: 'CNY', symbol: '¥', name: '人民币' },
  { code: 'USD', symbol: '$', name: '美元' },
  { code: 'EUR', symbol: '€', name: '欧元' },
  { code: 'GBP', symbol: '£', name: '英镑' },
  { code: 'JPY', symbol: '¥', name: '日元' },
  { code: 'HKD', symbol: 'HK$', name: '港币' },
];

export default function EditReimbursementPage() {
  const router = useRouter();
  const params = useParams();
  const reimbursementId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [description, setDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // 汇率缓存
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
    USD: 1,
    CNY: 0.14,
    EUR: 1.08,
    GBP: 1.27,
    JPY: 0.0067,
    HKD: 0.13,
  });

  // 获取实时汇率
  const fetchExchangeRate = async (fromCurrency: string): Promise<number> => {
    if (fromCurrency === 'USD') return 1;
    if (exchangeRates[fromCurrency]) {
      return exchangeRates[fromCurrency];
    }
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
      if (response.ok) {
        const data = await response.json();
        const rate = data.rates?.USD || exchangeRates[fromCurrency] || 1;
        setExchangeRates(prev => ({ ...prev, [fromCurrency]: rate }));
        return rate;
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
    }
    return exchangeRates[fromCurrency] || 1;
  };

  // 更新费用明细并计算汇率
  const updateLineItemWithExchange = async (id: string, field: keyof LineItem, value: string) => {
    const item = lineItems.find(i => i.id === id);
    if (!item) return;

    const updatedItem = { ...item, [field]: value };

    if (field === 'amount' || field === 'currency') {
      const amount = parseFloat(field === 'amount' ? value : item.amount) || 0;
      const currency = field === 'currency' ? value : item.currency;

      if (amount > 0 && currency) {
        const rate = await fetchExchangeRate(currency);
        updatedItem.exchangeRate = rate;
        updatedItem.amountInUSD = parseFloat((amount * rate).toFixed(2));
      }
    }

    setLineItems(prevItems =>
      prevItems.map(i => i.id === id ? updatedItem : i)
    );
  };

  // 加载报销单数据
  useEffect(() => {
    const fetchReimbursement = async () => {
      try {
        const response = await fetch(`/api/reimbursements/${reimbursementId}`);
        const result = await response.json();

        if (result.success && result.data) {
          const data = result.data;

          // 检查是否可编辑（只有草稿状态可以编辑）
          if (data.status !== 'draft') {
            setError('只有草稿状态的报销单可以编辑');
            setLoading(false);
            return;
          }

          setDescription(data.title || '');

          // 转换 items 数据并计算汇率
          if (data.items && data.items.length > 0) {
            const loadedItems = await Promise.all(data.items.map(async (item: any) => {
              const currency = item.currency || 'CNY';
              const amount = parseFloat(item.amount) || 0;
              let rate = 1;
              let amountInUSD = amount;

              if (currency !== 'USD' && amount > 0) {
                try {
                  const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
                  if (response.ok) {
                    const rateData = await response.json();
                    rate = rateData.rates?.USD || 0.14;
                    amountInUSD = parseFloat((amount * rate).toFixed(2));
                  }
                } catch {
                  rate = currency === 'CNY' ? 0.14 : 1;
                  amountInUSD = parseFloat((amount * rate).toFixed(2));
                }
              }

              return {
                id: item.id || Date.now().toString(),
                description: item.description || '',
                category: item.category || '',
                amount: item.amount?.toString() || '',
                currency: currency,
                date: item.date ? new Date(item.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                receiptUrl: item.receiptUrl || '',
                vendor: item.vendor || '',
                exchangeRate: rate,
                amountInUSD: amountInUSD,
              };
            }));
            setLineItems(loadedItems);
          } else {
            setLineItems([{
              id: '1',
              description: '',
              category: '',
              amount: '',
              currency: 'CNY',
              date: new Date().toISOString().split('T')[0],
              vendor: '',
            }]);
          }
        } else {
          setError(result.error || '加载失败');
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError('加载报销单失败');
      } finally {
        setLoading(false);
      }
    };

    if (reimbursementId) {
      fetchReimbursement();
    }
  }, [reimbursementId]);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        description: '',
        category: '',
        amount: '',
        currency: 'CNY',
        date: new Date().toISOString().split('T')[0],
        vendor: '',
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string) => {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const totalAmount = lineItems.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const totalAmountUSD = lineItems.reduce(
    (sum, item) => sum + (item.amountInUSD || 0),
    0
  );

  const handleSubmit = async (isDraft: boolean) => {
    if (!description) {
      alert('请填写报销说明');
      return;
    }
    if (lineItems.some(item => !item.amount || !item.category)) {
      alert('请完善费用明细');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsData = lineItems.map(item => ({
        category: item.category,
        description: item.description,
        amount: item.amount,
        currency: item.currency,
        date: item.date,
        receiptUrl: item.receiptUrl,
        vendor: item.vendor || '',
        exchangeRate: item.exchangeRate || 1,
        amountInBaseCurrency: item.amountInUSD || parseFloat(item.amount) || 0,
      }));

      const response = await fetch(`/api/reimbursements/${reimbursementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: description,
          items: itemsData,
          status: isDraft ? 'draft' : 'pending',
          totalAmountInBaseCurrency: totalAmountUSD,
        }),
      });

      const result = await response.json();
      if (result.success) {
        router.push('/dashboard/reimbursements');
      } else {
        alert(result.error || '保存失败，请重试');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('保存失败，请重试');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '3px solid #e5e7eb',
          borderTopColor: '#2563eb',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#6b7280' }}>加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{
          width: '64px',
          height: '64px',
          backgroundColor: '#fee2e2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
          fontSize: '24px',
        }}>
          ⚠️
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
          无法编辑
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '20px' }}>{error}</p>
        <Link
          href="/dashboard/reimbursements"
          style={{
            display: 'inline-flex',
            padding: '10px 20px',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          返回报销列表
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Link href="/dashboard/reimbursements" style={{ color: '#6b7280', textDecoration: 'none', fontSize: '14px' }}>
            我的报销
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#111827', fontSize: '14px' }}>编辑报销</span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>编辑报销</h1>
      </div>

      {/* Main Form */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>费用详情</h3>
        </div>
        <div style={{ padding: '20px' }}>
          {/* General Description */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '6px',
            }}>
              报销说明 *
            </label>
            <input
              type="text"
              placeholder="例如：上海出差-客户拜访"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Line Items Section */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}>
              <label style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#374151',
              }}>
                费用明细
              </label>
              <button
                onClick={addLineItem}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
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
                + 添加明细
              </button>
            </div>

            {/* Line Items Table */}
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1.5fr 1fr 1.3fr 1fr 1fr 40px',
                gap: '8px',
                padding: '10px 12px',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6b7280',
              }}>
                <div>供应商</div>
                <div>描述</div>
                <div>类别</div>
                <div>金额</div>
                <div style={{ color: '#0369a1' }}>折算<br/>USD</div>
                <div>日期</div>
                <div></div>
              </div>

              {/* Line Items */}
              {lineItems.map((item, index) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1.5fr 1fr 1.3fr 1fr 1fr 40px',
                    gap: '8px',
                    padding: '10px 12px',
                    borderBottom: index < lineItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                    backgroundColor: 'white',
                  }}
                >
                  <input
                    type="text"
                    placeholder="供应商名称"
                    value={item.vendor || ''}
                    onChange={(e) => updateLineItem(item.id, 'vendor', e.target.value)}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '13px',
                      backgroundColor: 'white',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="费用描述"
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '13px',
                      backgroundColor: 'white',
                    }}
                  />
                  <select
                    value={item.category}
                    onChange={(e) => updateLineItem(item.id, 'category', e.target.value)}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '13px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">选择类别</option>
                    {expenseCategories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                  {/* 金额：币种+金额组合 */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <select
                      value={item.currency}
                      onChange={(e) => updateLineItemWithExchange(item.id, 'currency', e.target.value)}
                      style={{
                        padding: '8px 4px',
                        border: '1px solid #e5e7eb',
                        borderRight: 'none',
                        borderRadius: '6px 0 0 6px',
                        fontSize: '12px',
                        backgroundColor: '#f9fafb',
                        cursor: 'pointer',
                        color: '#6b7280',
                        minWidth: '70px',
                      }}
                    >
                      {currencies.map((curr) => (
                        <option key={curr.code} value={curr.code}>
                          {curr.symbol} {curr.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={(e) => updateLineItemWithExchange(item.id, 'amount', e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0 6px 6px 0',
                        fontSize: '13px',
                        backgroundColor: 'white',
                        minWidth: 0,
                      }}
                    />
                  </div>
                  {/* 折算USD */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 6px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: '#0369a1',
                    fontWeight: 600,
                  }}>
                    {item.amountInUSD !== undefined ? (
                      <span title={`汇率: ${item.exchangeRate?.toFixed(4) || '-'}`}>
                        ${item.amountInUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>-</span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={item.date}
                    onChange={(e) => updateLineItem(item.id, 'date', e.target.value)}
                    style={{
                      padding: '8px 6px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '13px',
                      backgroundColor: 'white',
                    }}
                  />
                  <button
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length === 1}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: lineItems.length === 1 ? '#d1d5db' : '#dc2626',
                      cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                      padding: '4px',
                      fontSize: '16px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Total and Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-end' }}>
              <div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>原币合计</p>
                <p style={{ fontSize: '20px', fontWeight: 600, color: '#6b7280' }}>
                  ¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#0369a1', marginBottom: '2px' }}>
                  折算美元 (记账本位币)
                </p>
                <p style={{ fontSize: '24px', fontWeight: 700, color: '#0369a1' }}>
                  ${totalAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => router.push('/dashboard/reimbursements')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#2563eb',
                  border: '1px solid #2563eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                保存草稿
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || !description}
                style={{
                  padding: '10px 20px',
                  background: isSubmitting || !description ? '#9ca3af' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: isSubmitting || !description ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '保存中...' : '保存并提交审批'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
