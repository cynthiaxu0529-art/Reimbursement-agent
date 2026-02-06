'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  amountInBaseCurrency?: number;
  date: string;
  vendor?: string;
  receiptUrl?: string;
}

interface Reimbursement {
  id: string;
  title: string;
  description?: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
  baseCurrency: string;
  status: 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'processing' | 'paid' | 'cancelled';
  submittedAt?: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
  items: ReimbursementItem[];
}

const statusConfig: Record<string, { label: string; bgColor: string; color: string }> = {
  draft: { label: '草稿', bgColor: '#f3f4f6', color: '#4b5563' },
  pending: { label: '待审批', bgColor: '#fef3c7', color: '#d97706' },
  under_review: { label: '审核中', bgColor: '#dbeafe', color: '#2563eb' },
  approved: { label: '已批准', bgColor: '#dcfce7', color: '#16a34a' },
  rejected: { label: '已拒绝', bgColor: '#fee2e2', color: '#dc2626' },
  processing: { label: '处理中', bgColor: '#dbeafe', color: '#2563eb' },
  paid: { label: '已付款', bgColor: '#dcfce7', color: '#16a34a' },
  cancelled: { label: '已取消', bgColor: '#f3f4f6', color: '#6b7280' },
};

const categoryLabels: Record<string, { label: string; icon: string }> = {
  flight: { label: '机票', icon: '✈️' },
  train: { label: '火车票', icon: '🚄' },
  hotel: { label: '酒店住宿', icon: '🏨' },
  meal: { label: '餐饮', icon: '🍽️' },
  taxi: { label: '交通', icon: '🚕' },
  office_supplies: { label: '办公用品', icon: '📎' },
  ai_token: { label: 'AI 服务', icon: '🤖' },
  cloud_resource: { label: '云资源', icon: '☁️' },
  client_entertainment: { label: '客户招待', icon: '🤝' },
  other: { label: '其他', icon: '📦' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  HKD: 'HK$', SGD: 'S$', AUD: 'A$', CAD: 'C$', KRW: '₩',
};

const generateReimbursementNumber = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const idSuffix = id.slice(-4).toUpperCase();
  return `BX${year}${month}${day}-${idSuffix}`;
};

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Reimbursement | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 预览附件：将base64 data URL转为Blob URL以提高渲染性能
  const handlePreviewReceipt = (url: string | null | undefined) => {
    if (!url) return;
    if (url.startsWith('data:')) {
      try {
        const parts = url.split(',');
        const meta = parts[0];
        const data = parts.slice(1).join(',');
        const mimeType = meta.split(':')[1].split(';')[0];
        const byteString = atob(data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        setPreviewImage(blobUrl);
        return;
      } catch (e) {
        console.error('Failed to convert data URL:', e);
      }
    }
    setPreviewImage(url);
  };

  const closePreview = () => {
    if (previewImage && previewImage.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
  };
  const [itemActionLoading, setItemActionLoading] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshList = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const response = await fetch(`/api/reimbursements?${params.toString()}`);
      const result = await response.json();
      if (result.success) setReimbursements(result.data || []);
    } catch (error) {
      console.error('Failed to fetch reimbursements:', error);
    }
  };

  useEffect(() => {
    const fetchReimbursements = async () => {
      setLoading(true);
      await refreshList();
      setLoading(false);
    };
    fetchReimbursements();
  }, [filter]);

  // Fetch expanded detail when expandedId changes
  useEffect(() => {
    if (!expandedId) {
      setExpandedData(null);
      return;
    }
    const listItem = reimbursements.find(r => r.id === expandedId);
    if (listItem) setExpandedData(listItem);

    const fetchDetail = async () => {
      setExpandLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${expandedId}`);
        const result = await response.json();
        if (result.success && result.data) setExpandedData(result.data);
      } catch (error) {
        console.error('Failed to fetch detail:', error);
      } finally {
        setExpandLoading(false);
      }
    };
    fetchDetail();
  }, [expandedId, reimbursements]);

  // 删除草稿
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个报销单吗？')) return;
    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        if (expandedId === id) {
          setExpandedId(null);
          setExpandedData(null);
        }
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      alert('删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 提交审批
  const handleSubmit = async (id: string) => {
    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      });
      const result = await response.json();
      if (result.success) {
        await refreshList();
        if (expandedId === id) {
          setExpandedData(prev => prev ? { ...prev, status: 'pending' } : null);
        }
      } else {
        alert(result.error || '提交失败');
      }
    } catch (error) {
      alert('提交失败');
    } finally {
      setActionLoading(null);
    }
  };

  // 撤回申请
  const handleWithdraw = async (id: string) => {
    if (!confirm('确定要撤回这个报销申请吗？')) return;
    setActionLoading(id);
    try {
      const response = await fetch(`/api/reimbursements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      const result = await response.json();
      if (result.success) {
        await refreshList();
        if (expandedId === id) {
          setExpandedData(prev => prev ? { ...prev, status: 'draft' } : null);
        }
      } else {
        alert(result.error || '撤回失败');
      }
    } catch (error) {
      alert('撤回失败');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete individual expense item
  const handleDeleteItem = async (reimbursementId: string, itemId: string) => {
    if (!confirm('确定要删除这项费用吗？')) return;
    setItemActionLoading(itemId);
    try {
      const response = await fetch(`/api/reimbursements/${reimbursementId}/items/${itemId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        // Update expandedData to remove the item
        if (expandedData && expandedData.id === reimbursementId) {
          const updatedItems = expandedData.items.filter(i => i.id !== itemId);
          const newTotalAmount = updatedItems.reduce((sum, i) => sum + i.amount, 0);
          const newTotalAmountInBaseCurrency = updatedItems.reduce(
            (sum, i) => sum + (i.amountInBaseCurrency || i.amount),
            0
          );
          setExpandedData({
            ...expandedData,
            items: updatedItems,
            totalAmount: newTotalAmount,
            totalAmountInBaseCurrency: newTotalAmountInBaseCurrency,
          });
        }
        await refreshList();
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      alert('删除失败');
    } finally {
      setItemActionLoading(null);
    }
  };

  // Handle file upload for receipt
  const handleFileUpload = async (file: File, reimbursementId: string, itemId: string) => {
    setUploadingItemId(itemId);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;

        // Update the item with the new receipt
        const response = await fetch(`/api/reimbursements/${reimbursementId}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiptUrl: base64 }),
        });
        const result = await response.json();

        if (result.success) {
          // Update expandedData with the new receipt
          if (expandedData && expandedData.id === reimbursementId) {
            setExpandedData({
              ...expandedData,
              items: expandedData.items.map(i =>
                i.id === itemId ? { ...i, receiptUrl: base64 } : i
              ),
            });
          }
        } else {
          alert(result.error || '上传失败');
        }
        setUploadingItemId(null);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert('上传失败');
      setUploadingItemId(null);
    }
  };

  // Trigger file input for a specific item
  const triggerFileUpload = (reimbursementId: string, itemId: string) => {
    setUploadingItemId(itemId);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload(file, reimbursementId, itemId);
      } else {
        setUploadingItemId(null);
      }
    };
    input.click();
  };

  const filteredReimbursements = reimbursements.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: reimbursements.length,
    pending: reimbursements.filter(r => r.status === 'pending' || r.status === 'under_review').length,
    approved: reimbursements.filter(r => r.status === 'approved').length,
    totalAmount: reimbursements.reduce((sum, r) => sum + r.totalAmount, 0),
    totalAmountUSD: reimbursements.reduce((sum, r) => {
      return sum + (r.totalAmountInBaseCurrency || 0);
    }, 0),
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getExchangeRate = (item: Reimbursement) => {
    if (item.totalAmountInBaseCurrency && item.totalAmount > 0) {
      return item.totalAmountInBaseCurrency / item.totalAmount;
    }
    return null; // 无汇率数据
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
            报销申请
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>管理和跟踪你的报销申请</p>
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
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '14px'
          }}
        >
          <span>+</span> 新建报销
        </Link>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '20px',
      }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            backgroundColor: filter === 'all' ? '#eff6ff' : 'white',
            borderRadius: '12px',
            padding: '16px',
            border: filter === 'all' ? '2px solid #2563eb' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>全部报销</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{stats.total}</p>
        </button>
        <button
          onClick={() => setFilter('pending')}
          style={{
            backgroundColor: filter === 'pending' ? '#fef3c7' : 'white',
            borderRadius: '12px',
            padding: '16px',
            border: filter === 'pending' ? '2px solid #d97706' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>待审批</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#d97706' }}>{stats.pending}</p>
        </button>
        <button
          onClick={() => setFilter('approved')}
          style={{
            backgroundColor: filter === 'approved' ? '#dcfce7' : 'white',
            borderRadius: '12px',
            padding: '16px',
            border: filter === 'approved' ? '2px solid #16a34a' : '1px solid #e5e7eb',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>已批准</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{stats.approved}</p>
        </button>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>报销总额</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', marginBottom: '4px' }}>
            ¥{stats.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#0369a1' }}>
            ${stats.totalAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '12px 16px',
        border: '1px solid #e5e7eb',
        marginBottom: '16px',
      }}>
        <input
          type="text"
          placeholder="搜索报销..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 100px 1.5fr 120px 80px 100px 90px 140px',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
        }}>
          <div>报销单号</div>
          <div>提交日期</div>
          <div>报销说明</div>
          <div style={{ textAlign: 'right' }}>原币金额</div>
          <div style={{ textAlign: 'right' }}>汇率</div>
          <div style={{ textAlign: 'right' }}>美元金额</div>
          <div style={{ textAlign: 'center' }}>状态</div>
          <div style={{ textAlign: 'center' }}>操作</div>
        </div>

        {/* Table Body */}
        <div>
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              加载中...
            </div>
          )}

          {!loading && filteredReimbursements.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                backgroundColor: '#f3f4f6',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px'
              }}>
                📄
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                {search ? '未找到匹配的报销记录' : '还没有报销记录'}
              </h3>
              <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
                {search ? '请尝试其他搜索关键词' : '创建你的第一笔报销'}
              </p>
              {!search && (
                <Link
                  href="/dashboard/reimbursements/new"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: 'white',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  + 新建报销
                </Link>
              )}
            </div>
          )}

          {!loading && filteredReimbursements.map((item) => {
            const statusInfo = statusConfig[item.status] || statusConfig.draft;
            const exchangeRate = getExchangeRate(item);
            const usdAmount = item.totalAmountInBaseCurrency || 0;
            const isExpanded = expandedId === item.id;
            const isLoading = actionLoading === item.id;

            return (
              <div key={item.id}>
                {/* Main Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 100px 1.5fr 120px 80px 100px 90px 140px',
                    gap: '12px',
                    padding: '14px 16px',
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: isExpanded ? '#f8fafc' : 'white',
                    alignItems: 'center',
                  }}
                >
                  {/* 报销单号 */}
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#2563eb',
                      fontWeight: 500,
                      cursor: item.items?.length > 0 ? 'pointer' : 'default',
                    }}
                    onClick={() => item.items?.length > 0 && setExpandedId(isExpanded ? null : item.id)}
                  >
                    #{item.id.slice(0, 8).toUpperCase()}
                    {item.items?.length > 1 && (
                      <span style={{ marginLeft: '4px', fontSize: '10px' }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    )}
                  </div>

                  {/* 提交日期 */}
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {formatDate(item.submittedAt || item.createdAt)}
                  </div>

                  {/* 报销说明 */}
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827', marginBottom: '2px' }}>
                      {item.title}
                    </p>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>
                      {item.items?.length || 0} 项费用
                    </p>
                  </div>

                  {/* 原币金额 */}
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                    {currencySymbols[item.items?.[0]?.currency] || '¥'}
                    {item.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>

                  {/* 汇率 */}
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
                    {exchangeRate !== null ? exchangeRate.toFixed(4) : 'N/A'}
                  </div>

                  {/* 美元金额 */}
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#0369a1' }}>
                    ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>

                  {/* 状态 */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      padding: '4px 8px',
                      borderRadius: '9999px',
                      backgroundColor: statusInfo.bgColor,
                      color: statusInfo.color,
                    }}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* 操作 */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    {item.status === 'draft' && (
                      <>
                        <Link
                          href={`/dashboard/reimbursements/${item.id}/edit`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#2563eb',
                            backgroundColor: '#eff6ff',
                            border: 'none',
                            borderRadius: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          编辑
                        </Link>
                        <button
                          onClick={() => handleSubmit(item.id)}
                          disabled={isLoading}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: 'white',
                            backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          提交
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={isLoading}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#dc2626',
                            backgroundColor: '#fee2e2',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          删除
                        </button>
                      </>
                    )}
                    {item.status === 'pending' && (
                      <button
                        onClick={() => handleWithdraw(item.id)}
                        disabled={isLoading}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          color: '#d97706',
                          backgroundColor: '#fef3c7',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        撤回
                      </button>
                    )}
                    {(item.status === 'approved' || item.status === 'paid') && (
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>-</span>
                    )}
                    {item.status === 'rejected' && (
                      <>
                        <Link
                          href={`/dashboard/reimbursements/${item.id}/edit`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#2563eb',
                            backgroundColor: '#eff6ff',
                            border: 'none',
                            borderRadius: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          修改
                        </Link>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={isLoading}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            color: '#dc2626',
                            backgroundColor: '#fee2e2',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          删除
                        </button>
                      </>
                    )}
                    {item.status === 'processing' && (
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>-</span>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '16px 24px 16px 40px',
                  }}>
                    {expandLoading && !expandedData && (
                      <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>加载中...</div>
                    )}

                    {expandedData && expandedData.id === item.id && expandedData.items && expandedData.items.length > 0 && (
                      <div style={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        overflow: 'hidden',
                      }}>
                        {/* Detail Header */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: (item.status === 'draft' || item.status === 'rejected')
                            ? '1.2fr 1.5fr 1fr 1.2fr 0.8fr 1fr 120px'
                            : '1.2fr 1.5fr 1fr 1.2fr 0.8fr 1fr',
                          gap: '8px',
                          padding: '10px 12px',
                          backgroundColor: '#f9fafb',
                          borderBottom: '1px solid #e5e7eb',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#6b7280',
                        }}>
                          <div>供应商</div>
                          <div>费用描述</div>
                          <div>类别</div>
                          <div style={{ textAlign: 'right' }}>原币金额</div>
                          <div style={{ textAlign: 'right' }}>汇率</div>
                          <div style={{ textAlign: 'right' }}>美元金额</div>
                          {(item.status === 'draft' || item.status === 'rejected') && (
                            <div style={{ textAlign: 'center' }}>操作</div>
                          )}
                        </div>

                        {/* Detail Rows */}
                        {expandedData.items.map((lineItem, idx) => {
                          const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                          const itemRate = lineItem.currency === 'USD' ? 1 :
                            (lineItem.amountInBaseCurrency && lineItem.amount > 0
                              ? lineItem.amountInBaseCurrency / lineItem.amount
                              : null);
                          const itemUsd = lineItem.amountInBaseCurrency || null;
                          const isItemLoading = itemActionLoading === lineItem.id || uploadingItemId === lineItem.id;
                          const canEdit = item.status === 'draft' || item.status === 'rejected';

                          return (
                            <div
                              key={lineItem.id || idx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: canEdit
                                  ? '1.2fr 1.5fr 1fr 1.2fr 0.8fr 1fr 120px'
                                  : '1.2fr 1.5fr 1fr 1.2fr 0.8fr 1fr',
                                gap: '8px',
                                padding: '10px 12px',
                                borderBottom: idx < (expandedData.items?.length || 0) - 1 ? '1px solid #f3f4f6' : 'none',
                                fontSize: '13px',
                              }}
                            >
                              <div style={{ color: '#374151' }}>
                                {lineItem.vendor || '-'}
                              </div>
                              <div style={{ color: '#111827' }}>
                                {lineItem.description || catInfo.label}
                                {lineItem.receiptUrl && (
                                  <button
                                    type="button"
                                    style={{
                                      marginLeft: '6px',
                                      fontSize: '11px',
                                      color: '#2563eb',
                                      cursor: 'pointer',
                                      background: 'none',
                                      border: 'none',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: '#eff6ff',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handlePreviewReceipt(lineItem.receiptUrl);
                                    }}
                                  >
                                    📎 查看凭证
                                  </button>
                                )}
                              </div>
                              <div>
                                <span style={{
                                  padding: '2px 6px',
                                  backgroundColor: '#f3f4f6',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  color: '#374151',
                                }}>
                                  {catInfo.icon} {catInfo.label}
                                </span>
                              </div>
                              <div style={{ textAlign: 'right', fontWeight: 500, color: '#111827' }}>
                                {currencySymbols[lineItem.currency] || lineItem.currency}
                                {lineItem.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: '2px' }}>
                                  {lineItem.currency}
                                </span>
                              </div>
                              <div style={{ textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>
                                {itemRate !== null ? itemRate.toFixed(4) : 'N/A'}
                              </div>
                              <div style={{ textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>
                                {itemUsd !== null ? `$${itemUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'N/A'}
                              </div>
                              {canEdit && (
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerFileUpload(item.id, lineItem.id);
                                    }}
                                    disabled={isItemLoading}
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '10px',
                                      color: '#2563eb',
                                      backgroundColor: '#eff6ff',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: isItemLoading ? 'not-allowed' : 'pointer',
                                      opacity: isItemLoading ? 0.6 : 1,
                                    }}
                                  >
                                    {uploadingItemId === lineItem.id ? '上传中...' : (lineItem.receiptUrl ? '更换凭证' : '上传凭证')}
                                  </button>
                                  {expandedData.items.length > 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteItem(item.id, lineItem.id);
                                      }}
                                      disabled={isItemLoading}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        color: '#dc2626',
                                        backgroundColor: '#fee2e2',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: isItemLoading ? 'not-allowed' : 'pointer',
                                        opacity: isItemLoading ? 0.6 : 1,
                                      }}
                                    >
                                      删除
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reject Reason */}
                    {expandedData?.status === 'rejected' && expandedData?.rejectReason && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        backgroundColor: '#fee2e2',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#991b1b',
                      }}>
                        <strong>拒绝原因：</strong>{expandedData.rejectReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'zoom-out',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={previewImage}
              alt="凭证预览"
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); closePreview(); }}
              style={{
                position: 'absolute',
                top: '-40px',
                right: 0,
                color: 'white',
                fontSize: '24px',
                padding: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <p style={{
              position: 'absolute',
              bottom: '-36px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '14px',
            }}>
              点击任意位置关闭
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
