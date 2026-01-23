'use client';

import { useState, useRef, useEffect } from 'react';
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

// 票据类型到费用类别的映射
const receiptTypeToCategory: Record<string, string> = {
  'flight_itinerary': 'flight',
  'train_ticket': 'train',
  'hotel_receipt': 'hotel',
  'taxi_receipt': 'taxi',
  'ride_hailing': 'taxi',
  'restaurant': 'meal',
  'vat_invoice': 'other',
  'vat_special': 'other',
  'general_receipt': 'other',
};

interface UploadedFile {
  file: File;
  preview: string;
}

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  location?: string;
  files: UploadedFile[];
  isRecognizing?: boolean;
  // 火车票/机票专用字段
  departure?: string;
  destination?: string;
  trainNumber?: string;
  flightNumber?: string;
  seatClass?: string;
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
      files: [],
    },
  ]);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // 从 sessionStorage 读取 OCR 数据并预填表单
  useEffect(() => {
    const ocrDataStr = sessionStorage.getItem('ocrData');
    if (ocrDataStr) {
      try {
        const ocrData = JSON.parse(ocrDataStr);
        sessionStorage.removeItem('ocrData'); // 使用后清除

        // 根据 OCR 数据设置标题
        const typeLabels: Record<string, string> = {
          'train_ticket': '火车票报销',
          'flight_itinerary': '机票报销',
          'hotel_receipt': '酒店报销',
          'taxi_receipt': '交通报销',
          'ride_hailing': '交通报销',
          'restaurant': '餐饮报销',
          'meal': '餐饮报销',
        };
        const suggestedTitle = typeLabels[ocrData.type] || typeLabels[ocrData.category] || '费用报销';
        setTitle(ocrData.vendor ? `${ocrData.vendor} - ${suggestedTitle}` : suggestedTitle);

        // 填充第一个费用项
        const category = ocrData.category || receiptTypeToCategory[ocrData.type] || 'other';
        const date = ocrData.date ? formatDateForInput(ocrData.date) : new Date().toISOString().split('T')[0];

        setItems([{
          id: '1',
          category: category,
          description: ocrData.vendor || '',
          amount: ocrData.amount ? ocrData.amount.toString() : '',
          currency: ocrData.currency || 'CNY',
          date: date,
          location: '',
          files: [],
          // 火车票/机票专用字段
          departure: ocrData.departure || '',
          destination: ocrData.destination || '',
          trainNumber: ocrData.trainNumber || '',
          flightNumber: ocrData.flightNumber || '',
          seatClass: ocrData.seatClass || '',
        }]);
      } catch (e) {
        console.error('Failed to parse OCR data:', e);
      }
    }
  }, []);

  // 格式化日期为 input[type=date] 需要的格式
  function formatDateForInput(dateStr: string): string {
    try {
      // 尝试解析各种日期格式
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      // 如果是 2025/12/23 格式
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return new Date().toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }

  // 将文件转换为 base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // 调用 OCR API 识别票据
  const recognizeReceipt = async (file: File, itemId: string) => {
    // 标记正在识别
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, isRecognizing: true } : item
    ));

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        const ocrData = result.data;
        const category = ocrData.category || receiptTypeToCategory[ocrData.type] || '';
        const date = ocrData.date ? formatDateForInput(new Date(ocrData.date).toLocaleDateString('zh-CN')) : '';

        // 更新表单字段
        setItems(prev => prev.map(item => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            category: category || item.category,
            description: ocrData.vendor || item.description,
            amount: ocrData.amount ? ocrData.amount.toString() : item.amount,
            currency: ocrData.currency || item.currency,
            date: date || item.date,
            isRecognizing: false,
            // 火车票/机票专用字段
            departure: ocrData.departure || item.departure,
            destination: ocrData.destination || item.destination,
            trainNumber: ocrData.trainNumber || item.trainNumber,
            flightNumber: ocrData.flightNumber || item.flightNumber,
            seatClass: ocrData.seatClass || item.seatClass,
          };
        }));

        // 如果标题为空，自动设置
        if (!title && ocrData.vendor) {
          const typeLabels: Record<string, string> = {
            'train_ticket': '火车票报销',
            'flight_itinerary': '机票报销',
            'hotel_receipt': '酒店报销',
            'taxi_receipt': '交通报销',
            'restaurant': '餐饮报销',
          };
          const suggestedTitle = typeLabels[ocrData.type] || '费用报销';
          setTitle(`${ocrData.vendor} - ${suggestedTitle}`);
        }
      } else {
        // 识别失败，取消识别状态
        setItems(prev => prev.map(item =>
          item.id === itemId ? { ...item, isRecognizing: false } : item
        ));
      }
    } catch (error) {
      console.error('OCR error:', error);
      setItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, isRecognizing: false } : item
      ));
    }
  };

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
        files: [],
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof ExpenseItem, value: any) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleFileSelect = async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    }));

    const item = items.find(i => i.id === itemId);
    if (item) {
      updateItem(itemId, 'files', [...item.files, ...newFiles]);
    }

    // 自动识别第一个上传的图片文件
    const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
    if (imageFile) {
      await recognizeReceipt(imageFile, itemId);
    }
  };

  const handleDrop = async (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    await handleFileSelect(itemId, files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (itemId: string, fileIndex: number) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      const newFiles = item.files.filter((_, idx) => idx !== fileIndex);
      updateItem(itemId, 'files', newFiles);
    }
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const handleSubmit = async (isDraft: boolean) => {
    setIsSubmitting(true);
    try {
      // 构建费用明细，包含出发地/目的地信息
      const itemsData = items.map(item => {
        // 对于火车票/机票，将出发地-目的地加入描述
        let description = item.description;
        if ((item.category === 'train' || item.category === 'flight') && item.departure && item.destination) {
          description = `${item.departure} → ${item.destination}${item.trainNumber ? ` (${item.trainNumber})` : ''}${item.flightNumber ? ` (${item.flightNumber})` : ''}${item.seatClass ? ` ${item.seatClass}` : ''}`;
        }
        return {
          category: item.category,
          description: description,
          amount: item.amount,
          currency: item.currency,
          date: item.date,
          location: item.location,
          vendor: item.description, // 原始的商家/承运人信息
        };
      });

      const response = await fetch('/api/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          tripId: tripId || undefined,
          items: itemsData,
          status: isDraft ? 'draft' : 'pending',
        }),
      });

      const result = await response.json();
      if (result.success) {
        router.push('/dashboard/reimbursements');
      } else {
        alert(result.error || '提交失败，请重试');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('提交失败，请重试');
      setIsSubmitting(false);
    }
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
        <p style={{ color: '#6b7280' }}>填写报销信息并上传票据（上传后自动识别）</p>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: '#111827' }}>费用 #{index + 1}</span>
                  {item.isRecognizing && (
                    <span style={{
                      fontSize: '0.75rem',
                      color: '#2563eb',
                      backgroundColor: '#eff6ff',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      识别中...
                    </span>
                  )}
                </div>
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

              {/* Receipt Upload - Move to top */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>上传票据（自动识别）</label>
                <input
                  type="file"
                  ref={el => { fileInputRefs.current[item.id] = el; }}
                  onChange={(e) => handleFileSelect(item.id, e.target.files)}
                  accept="image/*,.pdf"
                  multiple
                  style={{ display: 'none' }}
                />
                <div
                  onClick={() => fileInputRefs.current[item.id]?.click()}
                  onDrop={(e) => handleDrop(e, item.id)}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  style={{
                    border: '2px dashed #2563eb',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: '#eff6ff',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📤</div>
                  <p style={{ fontSize: '0.875rem', color: '#2563eb', marginBottom: '0.125rem', fontWeight: 500 }}>
                    点击或拖拽上传票据，自动识别填充
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    支持 JPG, PNG, PDF 格式
                  </p>
                </div>

                {/* Uploaded Files Preview */}
                {item.files.length > 0 && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {item.files.map((uploadedFile, fileIndex) => (
                      <div
                        key={fileIndex}
                        style={{
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.5rem',
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem'
                        }}
                      >
                        {uploadedFile.preview ? (
                          <img
                            src={uploadedFile.preview}
                            alt="预览"
                            style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '0.25rem' }}
                          />
                        ) : (
                          <span style={{ fontSize: '1rem' }}>📄</span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: '#374151', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {uploadedFile.file.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(item.id, fileIndex); }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '0',
                            fontSize: '0.875rem',
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
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

              {/* Row 2: Departure/Destination for Train/Flight */}
              {(item.category === 'train' || item.category === 'flight') && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div>
                    <label style={labelStyle}>出发地 *</label>
                    <input
                      type="text"
                      placeholder={item.category === 'train' ? '例如：北京南站' : '例如：北京首都'}
                      value={item.departure || ''}
                      onChange={(e) => updateItem(item.id, 'departure', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>目的地 *</label>
                    <input
                      type="text"
                      placeholder={item.category === 'train' ? '例如：上海虹桥站' : '例如：上海浦东'}
                      value={item.destination || ''}
                      onChange={(e) => updateItem(item.id, 'destination', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>{item.category === 'train' ? '车次号' : '航班号'}</label>
                    <input
                      type="text"
                      placeholder={item.category === 'train' ? '例如：G1234' : '例如：CA1234'}
                      value={item.category === 'train' ? (item.trainNumber || '') : (item.flightNumber || '')}
                      onChange={(e) => updateItem(item.id, item.category === 'train' ? 'trainNumber' : 'flightNumber', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              {/* Row 3: Description, Location/Seat Class */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: (item.category === 'train' || item.category === 'flight') ? 'repeat(3, 1fr)' : '1fr 1fr',
                gap: '1rem'
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

                {(item.category === 'train' || item.category === 'flight') && (
                  <div>
                    <label style={labelStyle}>座位等级</label>
                    <select
                      value={item.seatClass || ''}
                      onChange={(e) => updateItem(item.id, 'seatClass', e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">选择座位等级</option>
                      {item.category === 'train' ? (
                        <>
                          <option value="二等座">二等座</option>
                          <option value="一等座">一等座</option>
                          <option value="商务座">商务座</option>
                          <option value="硬座">硬座</option>
                          <option value="软座">软座</option>
                          <option value="硬卧">硬卧</option>
                          <option value="软卧">软卧</option>
                        </>
                      ) : (
                        <>
                          <option value="经济舱">经济舱</option>
                          <option value="超级经济舱">超级经济舱</option>
                          <option value="公务舱">公务舱</option>
                          <option value="头等舱">头等舱</option>
                        </>
                      )}
                    </select>
                  </div>
                )}

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
