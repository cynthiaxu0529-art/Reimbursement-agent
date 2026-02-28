'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useBaseCurrencyConversion } from '@/hooks/useBaseCurrencyConversion';
import { CurrencyType } from '@/types';

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
  receiptUrl?: string;
  receiptFileName?: string;
  vendor?: string;
  exchangeRate?: number;
  amountInUSD?: number;
  // Hotel specific
  checkInDate?: string;
  checkOutDate?: string;
  nights?: number;
  // Transit specific
  departure?: string;
  destination?: string;
  trainNumber?: string;
  flightNumber?: string;
  seatClass?: string;
}

// 支持的币种
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

export default function EditReimbursementPage() {
  const router = useRouter();
  const params = useParams();
  const reimbursementId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Upload / OCR state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isRecognizing, setIsRecognizing] = useState(false);

  // Form fields
  const [description, setDescription] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // 使用本位币转换 Hook
  const {
    convertToBase,
  } = useBaseCurrencyConversion();

  // 更新费用明细并计算汇率
  const updateLineItemWithExchange = useCallback(
    (id: string, field: keyof LineItem, value: string) => {
      const item = lineItems.find(i => i.id === id);
      if (!item) return;

      const updatedItem = { ...item, [field]: value };

      if (field === 'amount' || field === 'currency') {
        const amount = parseFloat(field === 'amount' ? value : item.amount) || 0;
        const currency = (field === 'currency' ? value : item.currency) as CurrencyType;

        if (amount > 0 && currency) {
          const conversion = convertToBase(amount, currency);
          if (conversion.success) {
            updatedItem.exchangeRate = conversion.rate;
            updatedItem.amountInUSD = conversion.amount;
          } else {
            updatedItem.exchangeRate = undefined;
            updatedItem.amountInUSD = undefined;
          }
        }
      }

      setLineItems(prevItems =>
        prevItems.map(i => i.id === id ? updatedItem : i)
      );
    },
    [lineItems, convertToBase]
  );

  // ============== OCR / Upload helpers ==============

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

  const calculateNights = (checkIn: string, checkOut: string): number => {
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const uploadToBlob = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await response.json();
      return result.success && result.url ? result.url : null;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  // Apply OCR data: create a new line item from recognized receipt
  const applyOcrData = useCallback((ocrData: any) => {
    const category = ocrData.category || receiptTypeToCategory[ocrData.type] || 'other';

    let itemDescription = ocrData.vendor || '';
    if ((category === 'train' || category === 'flight') && ocrData.departure && ocrData.destination) {
      itemDescription = `${ocrData.departure} → ${ocrData.destination}`;
      if (ocrData.trainNumber) itemDescription += ` (${ocrData.trainNumber})`;
      if (ocrData.flightNumber) itemDescription += ` (${ocrData.flightNumber})`;
      if (ocrData.seatClass) itemDescription += ` ${ocrData.seatClass}`;
    }

    const ocrCheckIn = ocrData.checkInDate ? formatDateForInput(ocrData.checkInDate) : undefined;
    const ocrCheckOut = ocrData.checkOutDate ? formatDateForInput(ocrData.checkOutDate) : undefined;
    const ocrNights = ocrData.nights || (ocrCheckIn && ocrCheckOut ? calculateNights(ocrCheckIn, ocrCheckOut) : undefined);

    if (category === 'hotel' && ocrCheckIn && ocrCheckOut && ocrNights) {
      itemDescription = `${itemDescription || '酒店住宿'} (${ocrCheckIn} 至 ${ocrCheckOut}, ${ocrNights}晚)`;
    }

    const currency = (ocrData.currency || 'CNY') as CurrencyType;
    const amount = ocrData.amount ? parseFloat(ocrData.amount) : 0;
    const conversion = amount > 0 ? convertToBase(amount, currency) : null;

    const newItem: LineItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      description: itemDescription,
      category,
      amount: ocrData.amount ? ocrData.amount.toString() : '',
      currency: currency,
      date: ocrCheckIn || (ocrData.date ? formatDateForInput(ocrData.date) : new Date().toISOString().split('T')[0]),
      vendor: ocrData.vendor || '',
      departure: ocrData.departure || '',
      destination: ocrData.destination || '',
      trainNumber: ocrData.trainNumber || '',
      flightNumber: ocrData.flightNumber || '',
      seatClass: ocrData.seatClass || '',
      checkInDate: ocrCheckIn,
      checkOutDate: ocrCheckOut,
      nights: ocrNights,
      receiptUrl: ocrData.receiptUrl || '',
      receiptFileName: ocrData.receiptFileName || '',
      exchangeRate: conversion?.success ? conversion.rate : undefined,
      amountInUSD: conversion?.success ? conversion.amount : undefined,
    };

    setLineItems(prev => [...prev, newItem]);
  }, [convertToBase]);

  // Batch apply multiple OCR results
  const applyMultipleOcrData = useCallback((ocrDataList: any[]) => {
    if (ocrDataList.length === 0) return;

    const newItems: LineItem[] = ocrDataList.map((ocrData, index) => {
      const category = ocrData.category || receiptTypeToCategory[ocrData.type] || 'other';

      let itemDescription = ocrData.vendor || '';
      if ((category === 'train' || category === 'flight') && ocrData.departure && ocrData.destination) {
        itemDescription = `${ocrData.departure} → ${ocrData.destination}`;
        if (ocrData.trainNumber) itemDescription += ` (${ocrData.trainNumber})`;
        if (ocrData.flightNumber) itemDescription += ` (${ocrData.flightNumber})`;
        if (ocrData.seatClass) itemDescription += ` ${ocrData.seatClass}`;
      }

      const ocrCheckIn = ocrData.checkInDate ? formatDateForInput(ocrData.checkInDate) : undefined;
      const ocrCheckOut = ocrData.checkOutDate ? formatDateForInput(ocrData.checkOutDate) : undefined;
      const ocrNights = ocrData.nights || (ocrCheckIn && ocrCheckOut ? calculateNights(ocrCheckIn, ocrCheckOut) : undefined);

      if (category === 'hotel' && ocrCheckIn && ocrCheckOut && ocrNights) {
        itemDescription = `${itemDescription || '酒店住宿'} (${ocrCheckIn} 至 ${ocrCheckOut}, ${ocrNights}晚)`;
      }

      const currency = (ocrData.currency || 'CNY') as CurrencyType;
      const amount = ocrData.amount ? parseFloat(ocrData.amount) : 0;
      const conversion = amount > 0 ? convertToBase(amount, currency) : null;

      return {
        id: Date.now().toString() + index + Math.random().toString(36).substr(2, 9),
        description: itemDescription,
        category,
        amount: ocrData.amount ? ocrData.amount.toString() : '',
        currency: currency,
        date: ocrCheckIn || (ocrData.date ? formatDateForInput(ocrData.date) : new Date().toISOString().split('T')[0]),
        vendor: ocrData.vendor || '',
        departure: ocrData.departure || '',
        destination: ocrData.destination || '',
        trainNumber: ocrData.trainNumber || '',
        flightNumber: ocrData.flightNumber || '',
        seatClass: ocrData.seatClass || '',
        checkInDate: ocrCheckIn,
        checkOutDate: ocrCheckOut,
        nights: ocrNights,
        receiptUrl: ocrData.receiptUrl || '',
        receiptFileName: ocrData.receiptFileName || '',
        exchangeRate: conversion?.success ? conversion.rate : undefined,
        amountInUSD: conversion?.success ? conversion.amount : undefined,
      };
    });

    setLineItems(prev => [...prev, ...newItems]);
  }, [convertToBase]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);

    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      setIsRecognizing(true);
      const ocrResults: any[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        try {
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
            ocrResults.push({
              ...result.data,
              receiptUrl: blobUrl || '',
              receiptFileName: imageFile.name,
            });
          }
        } catch (error) {
          console.error('OCR/Upload error:', error);
        }
      }

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

  // ============== Load existing data ==============

  useEffect(() => {
    const fetchReimbursement = async () => {
      try {
        const response = await fetch(`/api/reimbursements/${reimbursementId}`);
        const result = await response.json();

        if (result.success && result.data) {
          const data = result.data;

          if (data.status !== 'draft') {
            setError('只有草稿状态的报销单可以编辑');
            setLoading(false);
            return;
          }

          setDescription(data.title || '');

          if (data.items && data.items.length > 0) {
            const loadedItems: LineItem[] = data.items.map((item: any) => {
              const currency = item.currency || 'CNY';
              const amount = parseFloat(item.amount) || 0;
              const conversion = amount > 0 ? convertToBase(amount, currency as CurrencyType) : null;

              return {
                id: item.id || Date.now().toString(),
                description: item.description || '',
                category: item.category || '',
                amount: item.amount?.toString() || '',
                currency,
                date: item.date ? new Date(item.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                receiptUrl: item.receiptUrl || '',
                vendor: item.vendor || '',
                exchangeRate: conversion?.success ? conversion.rate : undefined,
                amountInUSD: conversion?.success ? conversion.amount : (item.amountInBaseCurrency || undefined),
                checkInDate: item.checkInDate ? new Date(item.checkInDate).toISOString().split('T')[0] : undefined,
                checkOutDate: item.checkOutDate ? new Date(item.checkOutDate).toISOString().split('T')[0] : undefined,
                nights: item.nights || undefined,
              };
            });
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
  }, [reimbursementId, convertToBase]);

  // ============== Item CRUD ==============

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

  // ============== Submit ==============

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
        if (item.category === 'hotel' && item.checkInDate && item.checkOutDate) {
          const nights = item.nights || calculateNights(item.checkInDate, item.checkOutDate);
          itemDesc = `${item.description || item.vendor || '酒店住宿'} (${item.checkInDate} 至 ${item.checkOutDate}, ${nights}晚)`;
        }
        return {
          category: item.category,
          description: itemDesc,
          amount: item.amount,
          currency: item.currency,
          date: item.checkInDate || item.date,
          receiptUrl: item.receiptUrl || '',
          vendor: item.vendor || '',
          exchangeRate: item.exchangeRate || 1,
          amountInBaseCurrency: item.amountInUSD || parseFloat(item.amount) || 0,
          checkInDate: item.checkInDate,
          checkOutDate: item.checkOutDate,
          nights: item.nights,
        };
      });

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

  // ============== Render ==============

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
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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

      {/* Main Content - Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
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
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                上传新的票据，AI 自动识别并添加明细
              </p>
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
                  padding: '32px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#fafafa',
                  transition: 'all 0.2s',
                  minHeight: '160px',
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
                      width: '56px',
                      height: '56px',
                      borderRadius: '14px',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px',
                    }}>
                      <span style={{ fontSize: '24px' }}>📤</span>
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
                      marginTop: '10px',
                      padding: '4px 10px',
                      backgroundColor: '#eff6ff',
                      borderRadius: '6px',
                    }}>
                      AI 自动识别并添加新明细
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
                          padding: '10px',
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
                              width: '40px',
                              height: '40px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '40px',
                            height: '40px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: '18px' }}>📄</span>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: '12px',
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
                            fontSize: '16px',
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

          {/* Existing receipts summary */}
          {lineItems.some(item => item.receiptUrl) && (
            <div style={{
              marginTop: '16px',
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 20px',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>已关联票据</h3>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {lineItems.filter(item => item.receiptUrl).map(item => (
                  <div
                    key={item.id}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                      backgroundColor: '#f9fafb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={item.description || item.category}
                  >
                    <img
                      src={item.receiptUrl}
                      alt="票据"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size: 1.25rem;">📄</span>';
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    gridTemplateColumns: '32px 1.2fr 1.5fr 1fr 1.3fr 1fr 1fr 40px',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                  }}>
                    <div></div>
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
                        gridTemplateColumns: '32px 1.2fr 1.5fr 1fr 1.3fr 1fr 1fr 40px',
                        gap: '8px',
                        padding: '10px 12px',
                        borderBottom: index < lineItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                        backgroundColor: 'white',
                      }}
                    >
                      {/* Receipt thumbnail */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {item.receiptUrl ? (
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '4px',
                              border: '1px solid #e5e7eb',
                              overflow: 'hidden',
                              cursor: 'pointer',
                            }}
                            title="已关联票据"
                          >
                            <img
                              src={item.receiptUrl}
                              alt="票据"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-size:14px">📄</span>';
                              }}
                            />
                          </div>
                        ) : (
                          <span style={{ fontSize: '14px', color: '#d1d5db' }} title="无票据">-</span>
                        )}
                      </div>
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
      </div>
    </div>
  );
}
