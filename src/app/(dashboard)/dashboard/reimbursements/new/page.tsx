'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBaseCurrencyConversion } from '@/hooks/useBaseCurrencyConversion';
import { CurrencyType } from '@/types';
import TripItineraryPanel from '@/components/TripItineraryPanel';

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
  exchangeRate?: number;
  amountInUSD?: number;
  // Hotel specific fields
  checkInDate?: string;
  checkOutDate?: string;
  nights?: number;
  // Receipt attachment
  receiptUrl?: string;
  receiptFileName?: string;
}

// 支持的币种（完整列表）
const currencies = [
  { code: 'CNY', symbol: '¥', name: '人民币' },
  { code: 'USD', symbol: '$', name: '美元' },
  { code: 'EUR', symbol: '€', name: '欧元' },
  { code: 'GBP', symbol: '£', name: '英镑' },
  { code: 'JPY', symbol: 'JP¥', name: '日元' },
  { code: 'HKD', symbol: 'HK$', name: '港币' },
  { code: 'SGD', symbol: 'S$', name: '新加坡元' },
  { code: 'AUD', symbol: 'A$', name: '澳元' },
  { code: 'CAD', symbol: 'C$', name: '加元' },
  { code: 'KRW', symbol: '₩', name: '韩元' },
];

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
      exchangeRate: undefined,
      amountInUSD: undefined,
    },
  ]);
  const [itemsAutoFilled, setItemsAutoFilled] = useState(false);

  // Trip itinerary (saved after confirmation)
  const [confirmedItinerary, setConfirmedItinerary] = useState<any>(null);

  // 使用本位币转换 Hook（自动处理目标货币，避免方向错误）
  const {
    baseCurrency,
    baseCurrencySymbol,
    loading: ratesLoading,
    convertToBase,
    getRateToBase,
    formatBaseAmount,
  } = useBaseCurrencyConversion();

  // 更新费用明细并计算汇率（使用本位币转换 Hook，无需手动指定目标货币）
  const updateLineItemWithExchange = useCallback(
    (id: string, field: keyof LineItem, value: string) => {
      const item = lineItems.find((i) => i.id === id);
      if (!item) return;

      const updatedItem = { ...item, [field]: value };

      // 如果金额或币种变化，重新计算本位币金额
      if (field === 'amount' || field === 'currency') {
        const amount = parseFloat(field === 'amount' ? value : item.amount) || 0;
        const currency = (field === 'currency' ? value : item.currency) as CurrencyType;

        if (amount > 0 && currency) {
          // 使用封装好的本位币转换，无需手动指定目标货币
          const conversion = convertToBase(amount, currency);

          if (conversion.success) {
            updatedItem.exchangeRate = conversion.rate;
            updatedItem.amountInUSD = conversion.amount;
          } else {
            // 汇率获取失败，显示警告
            updatedItem.exchangeRate = undefined;
            updatedItem.amountInUSD = undefined;
            console.warn(conversion.error);
            // 显示用户提示
            alert(`汇率警告：${conversion.error}`);
          }
        }
      }

      setLineItems((prevItems) =>
        prevItems.map((i) => (i.id === id ? updatedItem : i))
      );
    },
    [lineItems, convertToBase]
  );

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
  const applyMultipleOcrData = async (ocrDataList: any[]) => {
    if (ocrDataList.length === 0) return;

    // 创建所有新的费用明细项（每项包含各自的供应商）
    const newItems: LineItem[] = [];

    for (let index = 0; index < ocrDataList.length; index++) {
      const ocrData = ocrDataList[index];
      const category = ocrData.category || receiptTypeToCategory[ocrData.type] || 'other';

      let itemDescription = ocrData.vendor || '';
      if ((category === 'train' || category === 'flight') && ocrData.departure && ocrData.destination) {
        itemDescription = `${ocrData.departure} → ${ocrData.destination}`;
        if (ocrData.trainNumber) itemDescription += ` (${ocrData.trainNumber})`;
        if (ocrData.flightNumber) itemDescription += ` (${ocrData.flightNumber})`;
        if (ocrData.seatClass) itemDescription += ` ${ocrData.seatClass}`;
      }

      const currency = ocrData.currency || 'CNY';
      const amount = ocrData.amount ? parseFloat(ocrData.amount) : 0;
      // 使用封装好的本位币转换，无需手动指定目标货币
      const conversion = amount > 0 ? convertToBase(amount, currency as CurrencyType) : null;

      // 如果汇率获取失败，收集错误信息
      if (conversion && !conversion.success) {
        console.warn(`OCR 项目汇率警告: ${conversion.error}`);
      }

      newItems.push({
        id: Date.now().toString() + index + Math.random().toString(36).substr(2, 9),
        description: itemDescription,
        category: category,
        amount: ocrData.amount ? ocrData.amount.toString() : '',
        currency: currency,
        date: ocrData.date ? formatDateForInput(ocrData.date) : new Date().toISOString().split('T')[0],
        vendor: ocrData.vendor || '',
        departure: ocrData.departure || '',
        destination: ocrData.destination || '',
        trainNumber: ocrData.trainNumber || '',
        flightNumber: ocrData.flightNumber || '',
        seatClass: ocrData.seatClass || '',
        exchangeRate: conversion?.success ? conversion.rate : undefined,
        amountInUSD: conversion?.success ? conversion.amount : undefined,
        receiptUrl: ocrData.receiptUrl || '',
        receiptFileName: ocrData.receiptFileName || '',
      });
    }

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

  // 上传文件到 Vercel Blob 获取永久URL
  const uploadToBlob = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success && result.url) {
        return result.url;
      } else {
        console.error('Upload failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
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

    // 本地预览使用临时URL，仅用于显示
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

      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];

        try {
          // 并行执行：上传到 Blob 存储 + OCR 识别
          const [blobUrl, base64] = await Promise.all([
            uploadToBlob(imageFile),
            fileToBase64(imageFile),
          ]);

          const mimeType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

          const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType }),
          });

          const result = await response.json();
          if (result.success && result.data) {
            // 使用 Blob 永久 URL（如果上传成功）
            ocrResults.push({
              ...result.data,
              receiptUrl: blobUrl || '', // 使用永久URL
              receiptFileName: imageFile.name,
            });
          }
        } catch (error) {
          console.error('OCR/Upload error:', error);
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

  // 计算美元总额
  const totalAmountUSD = lineItems.reduce(
    (sum, item) => sum + (item.amountInUSD || 0),
    0
  );

  // 计算住宿晚数
  const calculateNights = (checkIn: string, checkOut: string): number => {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const diffTime = checkOutDate.getTime() - checkInDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1;
  };

  // 更新酒店入住信息
  const updateHotelDates = (id: string, checkIn: string, checkOut: string) => {
    const nights = calculateNights(checkIn, checkOut);
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, checkInDate: checkIn, checkOutDate: checkOut, nights, date: checkIn } : item
    ));
  };

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
        // Add hotel stay info to description
        if (item.category === 'hotel' && item.checkInDate && item.checkOutDate) {
          const nights = item.nights || calculateNights(item.checkInDate, item.checkOutDate);
          itemDesc = `${item.description || item.vendor || '酒店住宿'} (${item.checkInDate} 至 ${item.checkOutDate}, ${nights}晚)`;
        }
        return {
          category: item.category,
          description: itemDesc,
          amount: item.amount,
          currency: item.currency,
          date: item.checkInDate || item.date, // Use check-in date for hotels
          vendor: item.vendor || '',
          exchangeRate: item.exchangeRate || 1,
          amountInBaseCurrency: item.amountInUSD || parseFloat(item.amount) || 0,
          // Include hotel stay period for policy checking
          checkInDate: item.checkInDate,
          checkOutDate: item.checkOutDate,
          nights: item.nights,
          // Include receipt attachment
          receiptUrl: item.receiptUrl || '',
        };
      });

      const response = await fetch('/api/reimbursements', {
        method: 'POST',
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
        // 如果有已确认的行程单，关联到新创建的报销单
        if (confirmedItinerary && result.data?.id) {
          try {
            await fetch('/api/trip-itineraries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...confirmedItinerary,
                reimbursementId: result.data.id,
                status: 'confirmed',
              }),
            });
          } catch (itineraryError) {
            console.error('Failed to save itinerary association:', itineraryError);
          }
        }
        router.push('/dashboard/reimbursements');
      } else {
        const errMsg = result.detail ? `${result.error}\n详情: ${result.detail}` : result.error;
        alert(errMsg || '提交失败，请重试');
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
                    <div key={item.id}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1.5fr 1fr 1.3fr 1fr 1fr 40px',
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

                      {/* Extra fields for hotel */}
                      {item.category === 'hotel' && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '8px',
                          padding: '10px 12px',
                          backgroundColor: '#f0fdf4',
                          borderBottom: index < lineItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                        }}>
                          <div>
                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                              入住日期
                            </label>
                            <input
                              type="date"
                              value={item.checkInDate || item.date || ''}
                              onChange={(e) => {
                                const checkIn = e.target.value;
                                const checkOut = item.checkOutDate || '';
                                if (checkOut) {
                                  updateHotelDates(item.id, checkIn, checkOut);
                                } else {
                                  updateLineItem(item.id, 'checkInDate', checkIn);
                                  updateLineItem(item.id, 'date', checkIn);
                                }
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '12px',
                                backgroundColor: 'white',
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                              离店日期
                            </label>
                            <input
                              type="date"
                              value={item.checkOutDate || ''}
                              min={item.checkInDate || item.date}
                              onChange={(e) => {
                                const checkOut = e.target.value;
                                const checkIn = item.checkInDate || item.date || '';
                                if (checkIn) {
                                  updateHotelDates(item.id, checkIn, checkOut);
                                } else {
                                  updateLineItem(item.id, 'checkOutDate', checkOut);
                                }
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '12px',
                                backgroundColor: 'white',
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                              入住晚数
                            </label>
                            <div style={{
                              padding: '6px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                              backgroundColor: '#f9fafb',
                              color: item.nights ? '#111827' : '#9ca3af',
                            }}>
                              {item.nights ? `${item.nights} 晚` : '自动计算'}
                              {item.nights && item.amountInUSD ? (
                                <span style={{ marginLeft: '8px', color: '#0369a1', fontWeight: 500 }}>
                                  (${(item.amountInUSD / item.nights).toFixed(0)}/晚)
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Trip Itinerary Panel - 差旅报销时自动显示 */}
              <TripItineraryPanel
                lineItems={lineItems}
                description={description}
                onItineraryConfirmed={(itinerary) => {
                  setConfirmedItinerary(itinerary);
                }}
              />

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
