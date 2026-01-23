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
}

export default function NewReimbursementPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields - AI auto-filled indicators
  const [description, setDescription] = useState('');
  const [descAutoFilled, setDescAutoFilled] = useState(false);

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      description: '',
      category: '',
      amount: '',
      currency: 'CNY',
      date: new Date().toISOString().split('T')[0],
      vendor: '',
    },
  ]);
  const [itemsAutoFilled, setItemsAutoFilled] = useState(false);

  // 从 sessionStorage 读取 OCR 数据并预填表单
  useEffect(() => {
    const ocrDataStr = sessionStorage.getItem('ocrData');
    if (ocrDataStr) {
      try {
        const ocrData = JSON.parse(ocrDataStr);
        sessionStorage.removeItem('ocrData');
        applyOcrData(ocrData);
      } catch (e) {
        console.error('Failed to parse OCR data:', e);
      }
    }
  }, []);

  function formatDateForInput(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return new Date().toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }

  // 根据类别生成报销说明
  const generateDescription = (items: LineItem[]): string => {
    const validItems = items.filter(item => item.category);
    if (validItems.length === 0) return '';

    const categoryCount: Record<string, number> = {};
    validItems.forEach(item => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });

    const categoryLabels: Record<string, string> = {
      train: '火车票',
      flight: '机票',
      hotel: '酒店',
      meal: '餐饮',
      taxi: '交通',
      other: '费用',
    };

    const parts: string[] = [];
    for (const [cat, count] of Object.entries(categoryCount)) {
      const label = categoryLabels[cat] || '费用';
      if (count > 1) {
        parts.push(`${label}${count}张`);
      } else {
        parts.push(label);
      }
    }

    return parts.join(' + ') + '报销';
  };

  const applyOcrData = (ocrData: any, isFirstItem: boolean = false) => {
    const category = ocrData.category || receiptTypeToCategory[ocrData.type] || 'other';

    // 生成描述（用于新建行项目）
    let itemDescription = ocrData.vendor || '';
    if ((category === 'train' || category === 'flight') && ocrData.departure && ocrData.destination) {
      itemDescription = `${ocrData.departure} → ${ocrData.destination}`;
      if (ocrData.trainNumber) itemDescription += ` (${ocrData.trainNumber})`;
      if (ocrData.flightNumber) itemDescription += ` (${ocrData.flightNumber})`;
      if (ocrData.seatClass) itemDescription += ` ${ocrData.seatClass}`;
    }

    // 创建新的费用明细项（包含供应商）
    const newItem: LineItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      description: itemDescription,
      category: category,
      amount: ocrData.amount ? ocrData.amount.toString() : '',
      currency: ocrData.currency || 'CNY',
      date: ocrData.date ? formatDateForInput(ocrData.date) : new Date().toISOString().split('T')[0],
      vendor: ocrData.vendor || '',
      departure: ocrData.departure || '',
      destination: ocrData.destination || '',
      trainNumber: ocrData.trainNumber || '',
      flightNumber: ocrData.flightNumber || '',
      seatClass: ocrData.seatClass || '',
    };

    // 添加新项目到列表（如果第一项是空的则替换，否则添加）
    setLineItems(prevItems => {
      const isFirstEmpty = prevItems.length === 1 &&
        !prevItems[0].description &&
        !prevItems[0].amount &&
        !prevItems[0].category;

      const newItems = isFirstEmpty ? [newItem] : [...prevItems, newItem];

      // 自动更新报销说明
      const newDesc = generateDescription(newItems);
      if (newDesc) {
        setDescription(newDesc);
        setDescAutoFilled(true);
      }

      return newItems;
    });

    setItemsAutoFilled(true);
  };

  // 批量处理多个 OCR 结果
  const applyMultipleOcrData = (ocrDataList: any[]) => {
    if (ocrDataList.length === 0) return;

    // 创建所有新的费用明细项（每项包含各自的供应商）
    const newItems: LineItem[] = ocrDataList.map((ocrData, index) => {
      const category = ocrData.category || receiptTypeToCategory[ocrData.type] || 'other';

      let itemDescription = ocrData.vendor || '';
      if ((category === 'train' || category === 'flight') && ocrData.departure && ocrData.destination) {
        itemDescription = `${ocrData.departure} → ${ocrData.destination}`;
        if (ocrData.trainNumber) itemDescription += ` (${ocrData.trainNumber})`;
        if (ocrData.flightNumber) itemDescription += ` (${ocrData.flightNumber})`;
        if (ocrData.seatClass) itemDescription += ` ${ocrData.seatClass}`;
      }

      return {
        id: Date.now().toString() + index + Math.random().toString(36).substr(2, 9),
        description: itemDescription,
        category: category,
        amount: ocrData.amount ? ocrData.amount.toString() : '',
        currency: ocrData.currency || 'CNY',
        date: ocrData.date ? formatDateForInput(ocrData.date) : new Date().toISOString().split('T')[0],
        vendor: ocrData.vendor || '',
        departure: ocrData.departure || '',
        destination: ocrData.destination || '',
        trainNumber: ocrData.trainNumber || '',
        flightNumber: ocrData.flightNumber || '',
        seatClass: ocrData.seatClass || '',
      };
    });

    // 一次性更新所有费用明细
    setLineItems(prevItems => {
      const isFirstEmpty = prevItems.length === 1 &&
        !prevItems[0].description &&
        !prevItems[0].amount &&
        !prevItems[0].category;

      const finalItems = isFirstEmpty ? newItems : [...prevItems, ...newItems];

      // 自动更新报销说明
      const newDesc = generateDescription(finalItems);
      if (newDesc) {
        setDescription(newDesc);
        setDescAutoFilled(true);
      }

      return finalItems;
    });

    setItemsAutoFilled(true);
    setHasRecognizedItems(true);
  };

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

  // 记录是否已经有识别过的项目
  const [hasRecognizedItems, setHasRecognizedItems] = useState(false);

  const recognizeReceipt = async (file: File, isFirst: boolean) => {
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
        applyOcrData(result.data, isFirst);
      }
    } catch (error) {
      console.error('OCR error:', error);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);

    // 获取所有图片文件
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      setIsRecognizing(true);

      // 收集所有 OCR 结果
      const ocrResults: any[] = [];

      for (const imageFile of imageFiles) {
        try {
          const base64 = await fileToBase64(imageFile);
          const mimeType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

          const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType }),
          });

          const result = await response.json();
          if (result.success && result.data) {
            ocrResults.push(result.data);
          }
        } catch (error) {
          console.error('OCR error:', error);
        }
      }

      // 批量添加所有识别结果
      if (ocrResults.length > 0) {
        applyMultipleOcrData(ocrResults);
      }

      setIsRecognizing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

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
      const itemsData = lineItems.map(item => {
        let itemDesc = item.description;
        if ((item.category === 'train' || item.category === 'flight') && item.departure && item.destination) {
          itemDesc = `${item.departure} → ${item.destination}${item.trainNumber ? ` (${item.trainNumber})` : ''}${item.flightNumber ? ` (${item.flightNumber})` : ''}${item.seatClass ? ` ${item.seatClass}` : ''}`;
        }
        return {
          category: item.category,
          description: itemDesc,
          amount: item.amount,
          currency: item.currency,
          date: item.date,
          vendor: item.vendor || '',
        };
      });

      const response = await fetch('/api/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: description,
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

  const getCategoryLabel = (value: string) => {
    const cat = expenseCategories.find(c => c.value === value);
    return cat ? `${cat.icon} ${cat.label}` : value;
  };

  const AutoFilledBadge = () => (
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
      marginLeft: '8px',
    }}>
      <span style={{ fontSize: '10px' }}>✓</span> AI 自动填充
    </span>
  );

  const VerifiedBadge = () => (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px',
      color: '#16a34a',
      fontSize: '12px',
      marginLeft: '6px',
    }}>
      <span style={{ fontSize: '14px' }}>✓</span> 已验证
    </span>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Link href="/dashboard/reimbursements" style={{ color: '#6b7280', textDecoration: 'none', fontSize: '14px' }}>
            我的报销
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#111827', fontSize: '14px' }}>提交报销</span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>提交报销</h1>
      </div>

      {/* Main Content - Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px' }}>
        {/* Left Column - Upload Area */}
        <div>
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
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>上传票据</h3>
            </div>
            <div style={{ padding: '20px' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFileSelect(e.target.files)}
                accept="image/*,.pdf"
                multiple
                style={{ display: 'none' }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                style={{
                  border: '2px dashed #d1d5db',
                  borderRadius: '12px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#fafafa',
                  transition: 'all 0.2s',
                  minHeight: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isRecognizing ? (
                  <>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      border: '3px solid #e5e7eb',
                      borderTopColor: '#2563eb',
                      animation: 'spin 1s linear infinite',
                      marginBottom: '16px',
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ fontSize: '14px', color: '#2563eb', fontWeight: 500 }}>AI 正在识别票据...</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>请稍候，自动提取信息中</p>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '16px',
                    }}>
                      <span style={{ fontSize: '28px' }}>📤</span>
                    </div>
                    <p style={{ fontSize: '14px', color: '#111827', fontWeight: 500, marginBottom: '4px' }}>
                      点击或拖拽上传票据
                    </p>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>
                      支持 JPG, PNG, PDF 格式
                    </p>
                    <p style={{
                      fontSize: '11px',
                      color: '#2563eb',
                      marginTop: '12px',
                      padding: '6px 12px',
                      backgroundColor: '#eff6ff',
                      borderRadius: '6px',
                    }}>
                      AI 自动识别并填充表单
                    </p>
                  </>
                )}
              </div>

              {/* Uploaded Files Preview */}
              {uploadedFiles.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    已上传 {uploadedFiles.length} 个文件
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        {file.preview ? (
                          <img
                            src={file.preview}
                            alt="预览"
                            style={{
                              width: '48px',
                              height: '48px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '48px',
                            height: '48px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: '20px' }}>📄</span>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: '13px',
                            color: '#111827',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {file.file.name}
                          </p>
                          <p style={{ fontSize: '11px', color: '#6b7280' }}>
                            {(file.file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: '18px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Expense Details Form */}
        <div>
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>费用详情</h3>
                {itemsAutoFilled && <AutoFilledBadge />}
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              {/* General Description */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                }}>
                  报销说明 *
                  {descAutoFilled && <VerifiedBadge />}
                </label>
                <input
                  type="text"
                  placeholder="例如：上海出差-客户拜访"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setDescAutoFilled(false); }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: descAutoFilled ? '1px solid #86efac' : '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: descAutoFilled ? '#f0fdf4' : 'white',
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
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#374151',
                  }}>
                    费用明细
                    {itemsAutoFilled && <VerifiedBadge />}
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
                    gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 40px',
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
                    <div>日期</div>
                    <div></div>
                  </div>

                  {/* Line Items */}
                  {lineItems.map((item, index) => (
                    <div key={item.id}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr 40px',
                        gap: '8px',
                        padding: '10px 12px',
                        borderBottom: index < lineItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                        backgroundColor: itemsAutoFilled ? '#f0fdf4' : 'white',
                      }}>
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
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{
                            padding: '8px 6px',
                            backgroundColor: '#f3f4f6',
                            border: '1px solid #e5e7eb',
                            borderRight: 'none',
                            borderRadius: '6px 0 0 6px',
                            fontSize: '13px',
                            color: '#6b7280',
                          }}>
                            ¥
                          </span>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={item.amount}
                            onChange={(e) => updateLineItem(item.id, 'amount', e.target.value)}
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

                      {/* Extra fields for train/flight */}
                      {(item.category === 'train' || item.category === 'flight') && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '8px',
                          padding: '10px 12px',
                          backgroundColor: '#fefce8',
                          borderBottom: index < lineItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                        }}>
                          <input
                            type="text"
                            placeholder="出发地"
                            value={item.departure || ''}
                            onChange={(e) => updateLineItem(item.id, 'departure', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                              backgroundColor: 'white',
                            }}
                          />
                          <input
                            type="text"
                            placeholder="目的地"
                            value={item.destination || ''}
                            onChange={(e) => updateLineItem(item.id, 'destination', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                              backgroundColor: 'white',
                            }}
                          />
                          <input
                            type="text"
                            placeholder={item.category === 'train' ? '车次号' : '航班号'}
                            value={item.category === 'train' ? (item.trainNumber || '') : (item.flightNumber || '')}
                            onChange={(e) => updateLineItem(item.id, item.category === 'train' ? 'trainNumber' : 'flightNumber', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                              backgroundColor: 'white',
                            }}
                          />
                          <select
                            value={item.seatClass || ''}
                            onChange={(e) => updateLineItem(item.id, 'seatClass', e.target.value)}
                            style={{
                              padding: '6px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="">座位等级</option>
                            {item.category === 'train' ? (
                              <>
                                <option value="二等座">二等座</option>
                                <option value="一等座">一等座</option>
                                <option value="商务座">商务座</option>
                              </>
                            ) : (
                              <>
                                <option value="经济舱">经济舱</option>
                                <option value="公务舱">公务舱</option>
                                <option value="头等舱">头等舱</option>
                              </>
                            )}
                          </select>
                        </div>
                      )}
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
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>费用合计</p>
                  <p style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                    ¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </p>
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
                    {isSubmitting ? '提交中...' : '提交审批'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
