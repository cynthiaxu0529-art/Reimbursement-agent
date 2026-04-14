'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ReimbursementItem {
  id: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  amountInBaseCurrency?: number;
  date: string;
  receiptUrl?: string;
  receiptFileName?: string;
  vendor?: string;
  coaCode?: string;
  coaName?: string;
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
  baseCurrency?: string;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  items: ReimbursementItem[];
  submitter?: {
    id: string;
    name: string;
    email: string;
    department?: string;
  };
  paymentStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  paymentId?: string;
  aiSuggestions?: any[];
  isAdvance?: boolean;
  advancePurpose?: string;
}

const categoryLabels: Record<string, { label: string; icon: string; color: string }> = {
  // 差旅费
  flight: { label: '机票', icon: '✈️', color: '#3b82f6' },
  train: { label: '火车票', icon: '🚄', color: '#8b5cf6' },
  hotel: { label: '酒店住宿', icon: '🏨', color: '#f59e0b' },
  meal: { label: '餐饮', icon: '🍽️', color: '#ef4444' },
  taxi: { label: '市内交通', icon: '🚕', color: '#10b981' },
  car_rental: { label: '租车', icon: '🚗', color: '#06b6d4' },
  fuel: { label: '燃油费', icon: '⛽', color: '#f97316' },
  parking: { label: '停车费', icon: '🅿️', color: '#64748b' },
  toll: { label: '过路费', icon: '🛣️', color: '#78716c' },
  // 办公费
  office_supplies: { label: '办公用品', icon: '📎', color: '#6b7280' },
  equipment: { label: '设备采购', icon: '🖥️', color: '#4f46e5' },
  software: { label: '软件订阅', icon: '💿', color: '#7c3aed' },
  // 技术费用
  ai_token: { label: 'AI 服务', icon: '🤖', color: '#8b5cf6' },
  cloud_resource: { label: '云资源', icon: '☁️', color: '#0ea5e9' },
  api_service: { label: 'API 服务', icon: '🔌', color: '#0284c7' },
  hosting: { label: '托管服务', icon: '🖧', color: '#0891b2' },
  domain: { label: '域名费', icon: '🌐', color: '#0e7490' },
  // 行政费用
  admin_general: { label: '行政综合', icon: '🏢', color: '#6b7280' },
  courier: { label: '快递费', icon: '📦', color: '#92400e' },
  printing: { label: '打印复印', icon: '🖨️', color: '#78716c' },
  phone: { label: '通讯费', icon: '📱', color: '#16a34a' },
  internet: { label: '网络费', icon: '📡', color: '#0891b2' },
  utilities: { label: '水电费', icon: '💡', color: '#ca8a04' },
  // 业务费用
  client_entertainment: { label: '客户招待', icon: '🤝', color: '#f97316' },
  marketing: { label: '市场推广', icon: '📢', color: '#db2777' },
  training: { label: '培训费', icon: '📚', color: '#7c3aed' },
  conference: { label: '会议费', icon: '🎤', color: '#2563eb' },
  membership: { label: '会员订阅', icon: '🏷️', color: '#0f766e' },
  // S&M 销售与市场费用
  content_seo: { label: '内容 & SEO', icon: '📝', color: '#059669' },
  pr_communications: { label: '公关 & 传播', icon: '📰', color: '#7c3aed' },
  // 其他
  other: { label: '其他', icon: '📦', color: '#6b7280' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
};

const generateFormId = (createdAt: string, id: string, isAdvance?: boolean): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const idSuffix = id.slice(-5).toUpperCase();
  return isAdvance ? `#ADV-${year}-${idSuffix}` : `#RF-${year}-${idSuffix}`;
};

export default function DisbursementsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'ready' | 'processing' | 'history' | 'advances' | 'receivables'>('ready');
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  // 自定义打款金额（财务可修改）
  const [customPaymentAmounts, setCustomPaymentAmounts] = useState<Record<string, number>>({});
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  // 冲销相关状态
  const [reversalTarget, setReversalTarget] = useState<Reimbursement | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalAmount, setReversalAmount] = useState<number | ''>('');
  const [reversalCategory, setReversalCategory] = useState('full');
  const [reversalProcessing, setReversalProcessing] = useState(false);

  // 财务调整入账科目相关状态
  const [adjustingItem, setAdjustingItem] = useState<{
    reimbursementId: string;
    itemId: string;
    currentCategory: string;
    currentCoaCode?: string;
    currentCoaName?: string;
  } | null>(null);
  const [adjustNewCategory, setAdjustNewCategory] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // 预览附件：将base64 data URL转为Blob URL以提高渲染性能；PDF直接在新标签页打开
  const handlePreviewReceipt = (url: string | null | undefined) => {
    if (!url) return;
    // PDF 文件无法在 <img> 中显示，直接在新标签页打开
    if (url.match(/\.pdf(\?.*)?$/i) || url.startsWith('data:application/pdf')) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
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
    setImgLoadError(false);
    setPreviewImage(url);
  };

  const [imgLoadError, setImgLoadError] = useState(false);

  const closePreview = () => {
    if (previewImage && previewImage.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
    setImgLoadError(false);
  };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [payoutStatuses, setPayoutStatuses] = useState<Record<string, any>>({});
  const [paymentStats, setPaymentStats] = useState<{
    pendingCount: number;
    pendingTotal: number;
    processingCount: number;
    totalPaidCount: number;
    todayPaidCount: number;
  }>({
    pendingCount: 0,
    pendingTotal: 0,
    processingCount: 0,
    totalPaidCount: 0,
    todayPaidCount: 0,
  });

  // 检查用户角色，非财务角色重定向 - 从API获取而不是localStorage
  useEffect(() => {
    const checkRoles = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success && result.roles) {
          // 检查是否有财务权限（finance 或 super_admin）
          const hasFinanceAccess = result.roles.includes('finance') || result.roles.includes('super_admin');
          if (!hasFinanceAccess) {
            router.push('/dashboard');
          } else {
            setRoleChecked(true);
          }
        } else {
          router.push('/dashboard');
        }
      } catch {
        router.push('/dashboard');
      }
    };
    checkRoles();
  }, [router]);

  useEffect(() => {
    // 先加载列表（会同步更新统计卡片），再异步刷新 stats API
    // 顺序执行避免 stats API 覆盖列表推算出的正确数值
    fetchReimbursements().then(() => fetchPaymentStats());
  }, [activeTab]);

  const fetchPaymentStats = async () => {
    try {
      const response = await fetch('/api/payments/stats');
      const result = await response.json();
      if (result.success && result.stats) {
        setPaymentStats(result.stats);
      }
    } catch (error) {
      console.error('Failed to fetch payment stats:', error);
    }
  };

  const fetchReimbursements = async () => {
    setLoading(true);
    setReimbursements([]); // 切换 tab 时立即清空，防止旧数据残留
    try {
      let status = 'approved';
      if (activeTab === 'processing') status = 'processing';
      if (activeTab === 'history') status = 'paid,reversed';

      const response = await fetch(`/api/reimbursements?status=${status}&role=finance`);
      if (!response.ok) {
        console.error('[disbursements] API error:', response.status);
        return;
      }
      const result = await response.json();
      if (result.success) {
        let data = result.data || [];

        // 待付款 tab：同时获取已批准的预借款并合并到列表
        if (activeTab === 'ready') {
          try {
            const advRes = await fetch('/api/advances?status=approved');
            const advResult = await advRes.json();
            if (advResult.success && advResult.data) {
              const advanceItems: Reimbursement[] = advResult.data.map((adv: any) => ({
                id: adv.id,
                title: adv.title,
                status: 'approved',
                totalAmount: adv.amount,
                totalAmountInBaseCurrency: adv.amount,
                baseCurrency: adv.currency || 'USD',
                createdAt: adv.createdAt,
                submittedAt: adv.createdAt,
                approvedAt: adv.approvedAt,
                items: [],
                submitter: adv.user ? {
                  id: adv.user.id,
                  name: adv.user.name,
                  email: adv.user.email,
                  department: adv.user.department,
                } : undefined,
                isAdvance: true,
                advancePurpose: adv.purpose || adv.description || '',
              }));
              data = [...data, ...advanceItems];
            }
          } catch (err) {
            console.error('Failed to fetch advances:', err);
          }
        }

        setReimbursements(data);

        // 用列表实际数据同步统计卡片，避免 stats API 静默失败时显示 $0
        if (activeTab === 'ready') {
          const pendingTotal = data.reduce(
            (sum: number, r: Reimbursement) => sum + (r.totalAmountInBaseCurrency || r.totalAmount || 0),
            0
          );
          setPaymentStats(prev => ({
            ...prev,
            pendingCount: data.length,
            pendingTotal,
          }));
        } else if (activeTab === 'processing') {
          setPaymentStats(prev => ({ ...prev, processingCount: data.length }));
        } else if (activeTab === 'history') {
          const paidItems = data.filter((r: Reimbursement) => r.status === 'paid');
          setPaymentStats(prev => ({
            ...prev,
            totalPaidCount: paidItems.length,
          }));
        }

        // 从报销单的 aiSuggestions 中读取已保存的自定义打款金额
        const savedAmounts: Record<string, number> = {};
        for (const item of data) {
          const customAmountInfo = item.aiSuggestions?.find(
            (s: any) => s.type === 'custom_payment_amount'
          );
          if (customAmountInfo?.amount) {
            savedAmounts[item.id] = customAmountInfo.amount;
          }
        }
        setCustomPaymentAmounts(savedAmounts);
      }
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  // 手动刷新所有处理中的付款状态 - 直接调用 Fluxa API
  const refreshAllPayoutStatuses = async () => {
    if (refreshingStatus || reimbursements.length === 0) return;
    setRefreshingStatus(true);
    console.log('[刷新状态] 开始刷新', reimbursements.length, '笔付款状态...');

    let updatedCount = 0;
    let errorCount = 0;

    for (const item of reimbursements) {
      // 使用 findLast 获取最新的 payout 记录（避免查询旧的过期记录）
      const allPayouts = (item.aiSuggestions || []).filter(
        (s: any) => s.type === 'fluxa_payout_initiated'
      );
      const payoutInfo = allPayouts.length > 0 ? allPayouts[allPayouts.length - 1] : null;
      if (!payoutInfo?.payoutId) {
        console.log('[刷新状态] 跳过, 无 payoutId:', item.id);
        continue;
      }

      try {
        console.log('[刷新状态] 同步 payoutId:', payoutInfo.payoutId);
        // 使用新的 sync-status API 直接调用 Fluxa
        const res = await fetch('/api/payments/sync-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payoutId: payoutInfo.payoutId,
            reimbursementId: item.id,
          }),
        });
        const data = await res.json();
        console.log('[刷新状态] 响应:', data.success, data.status, data.dbUpdated);

        if (data.success) {
          setPayoutStatuses(prev => ({ ...prev, [item.id]: data }));
          if (data.dbUpdated) updatedCount++;
        } else {
          console.error('[刷新状态] 失败:', data.error);
          errorCount++;
        }
      } catch (error) {
        console.error('[刷新状态] 错误:', error);
        errorCount++;
      }
    }

    setRefreshingStatus(false);

    if (updatedCount > 0) {
      alert(`已更新 ${updatedCount} 笔付款状态，正在刷新列表...`);
      fetchReimbursements();
      fetchPaymentStats();
    } else if (errorCount > 0) {
      alert(`刷新失败 ${errorCount} 笔，请检查 Vercel 日志查看详情`);
    } else {
      alert('所有状态已是最新，无需更新');
    }
  };

  // 处理中 tab: 轮询 Fluxa payout 状态，自动更新 processing→paid / processing→approved
  const checkPayoutStatuses = async (items: Reimbursement[]) => {
    let hasStatusChange = false;
    for (const item of items) {
      const payoutInfo = item.aiSuggestions?.find(
        (s: any) => s.type === 'fluxa_payout_initiated'
      );
      if (!payoutInfo?.payoutId) continue;

      try {
        const res = await fetch(`/api/payments/status/${payoutInfo.payoutId}`);
        const data = await res.json();
        if (data.success) {
          setPayoutStatuses(prev => ({ ...prev, [item.id]: data }));
          if (data.statusChanged) hasStatusChange = true;
        }
      } catch {
        // ignore individual check failures
      }
    }
    // 如果有状态变化（succeeded/failed/expired），刷新列表
    if (hasStatusChange) {
      fetchReimbursements();
    }
  };

  // 处理中 tab 加载时自动检查状态
  useEffect(() => {
    if (activeTab === 'processing' && reimbursements.length > 0 && !loading) {
      checkPayoutStatuses(reimbursements);
      // 每 30 秒轮询一次
      const interval = setInterval(() => {
        checkPayoutStatuses(reimbursements);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, reimbursements.length, loading]);

  // 获取报销单的打款金额（自定义金额或原金额）
  const getPaymentAmount = (item: Reimbursement) => {
    const originalAmount = item.totalAmountInBaseCurrency || 0;
    return customPaymentAmounts[item.id] ?? originalAmount;
  };

  // 设置自定义打款金额（仅更新本地状态，不保存到后端）
  const setCustomAmount = (id: string, amount: number, maxAmount: number) => {
    // 确保金额在有效范围内
    const validAmount = Math.max(0.01, Math.min(amount, maxAmount));
    setCustomPaymentAmounts(prev => ({ ...prev, [id]: validAmount }));
  };

  // 保存自定义打款金额到后端
  const saveCustomAmount = async (id: string, amount: number) => {
    try {
      const response = await fetch(`/api/reimbursements/${id}/payment-amount`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPaymentAmount: amount }),
      });
      const result = await response.json();
      if (!result.success) {
        setErrorMessage(result.error || '保存打款金额失败');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Save custom amount error:', error);
      setErrorMessage('保存打款金额失败');
      return false;
    }
  };

  // 重置自定义打款金额
  const resetCustomAmount = async (id: string) => {
    try {
      const response = await fetch(`/api/reimbursements/${id}/payment-amount`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        setCustomPaymentAmounts(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Reset custom amount error:', error);
      return false;
    }
  };

  const processPayment = async (id: string) => {
    setProcessing(id);
    setErrorMessage(null);

    // 检查是否为预借款 - 走 Fluxa 支付流程
    const item = reimbursements.find(r => r.id === id);
    if (item?.isAdvance) {
      try {
        const response = await fetch(`/api/advances/${id}/process-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await response.json();
        if (result.success) {
          setReimbursements(prev => prev.filter(r => r.id !== id));
          setSelectedIds(prev => prev.filter(sid => sid !== id));
          setExpandedId(null);
          setErrorMessage(null);
          // 打开 Fluxa 审批链接
          if (result.approvalUrl) {
            window.open(result.approvalUrl, '_blank');
          }
          alert('预借款付款已提交，请在 Fluxa 钱包中完成审批');
          fetchPaymentStats();
        } else {
          const errorMsg = result.message || result.error || '预借款付款失败';
          setErrorMessage(errorMsg);
          alert(`预借款付款失败: ${errorMsg}`);
        }
      } catch (error) {
        console.error('Advance payment error:', error);
        setErrorMessage('预借款付款处理失败');
      } finally {
        setProcessing(null);
      }
      return;
    }

    try {
      // 获取自定义金额（如果有）
      const customAmount = customPaymentAmounts[id];
      const requestBody: any = { reimbursementId: id };
      if (customAmount !== undefined) {
        requestBody.customAmount = customAmount;
      }

      const response = await fetch(`/api/payments/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();

      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        setSelectedIds(prev => prev.filter(sid => sid !== id));
        setExpandedId(null);
        setErrorMessage(null);
        // 打开 Fluxa 审批链接
        if (result.approvalUrl) {
          window.open(result.approvalUrl, '_blank');
        }
        alert('付款已提交成功，请在 Fluxa 钱包中完成审批');
      } else {
        // 显示详细的错误信息
        const errorMsg = result.message || result.error || '付款处理失败';
        const errorDetails = result.details ? `\n详情: ${result.details}` : '';
        setErrorMessage(`${errorMsg}${errorDetails}`);
        alert(`付款失败: ${errorMsg}${errorDetails}`);
      }
    } catch (error) {
      console.error('Payment error:', error);
      const msg = error instanceof Error ? error.message : '网络错误';
      setErrorMessage(`付款处理失败: ${msg}`);
      alert(`付款处理失败: ${msg}`);
    } finally {
      setProcessing(null);
    }
  };

  const rejectPayment = async (id: string) => {
    const reason = prompt('请输入拒绝原因：');
    if (!reason) return;

    // 检查是否为预借款
    const item = reimbursements.find(r => r.id === id);

    setProcessing(id);
    try {
      let response;
      if (item?.isAdvance) {
        // 预借款使用 advances API 驳回
        response = await fetch(`/api/advances/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reason: `财务拒绝: ${reason}` }),
        });
      } else {
        response = await fetch(`/api/reimbursements/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected', rejectReason: `财务拒绝: ${reason}` }),
        });
      }
      const result = await response.json();

      if (result.success) {
        setReimbursements(prev => prev.filter(r => r.id !== id));
        setExpandedId(null);
        fetchPaymentStats();
        alert('已拒绝付款');
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const processBatchPayment = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要批量处理 ${selectedIds.length} 笔付款吗？`)) return;

    setBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/payments/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reimbursementId: id }),
        });
        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setReimbursements(prev => prev.filter(r => !selectedIds.includes(r.id)));
    setSelectedIds([]);
    setBatchProcessing(false);
    alert(`批量付款完成：${successCount} 笔成功${failCount > 0 ? `，${failCount} 笔失败` : ''}`);
  };

  const processBatchReject = async () => {
    if (selectedIds.length === 0) return;
    const reason = prompt(`请输入批量驳回原因（共 ${selectedIds.length} 笔）：`);
    if (!reason) return;

    setBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/reimbursements/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected', rejectReason: `财务批量驳回: ${reason}` }),
        });
        const result = await response.json();
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setReimbursements(prev => prev.filter(r => !selectedIds.includes(r.id)));
    setSelectedIds([]);
    setBatchProcessing(false);
    alert(`批量驳回完成：${successCount} 笔成功${failCount > 0 ? `，${failCount} 笔失败` : ''}`);
  };

  // 冲销操作
  const processReversal = async () => {
    if (!reversalTarget || !reversalReason.trim()) return;
    setReversalProcessing(true);
    try {
      const paidAmount = reversalTarget.totalAmountInBaseCurrency || 0;
      const body: any = {
        reason: reversalReason.trim(),
        category: reversalCategory,
      };
      if (reversalCategory === 'partial' && reversalAmount && reversalAmount > 0) {
        body.amount = reversalAmount;
      }
      const response = await fetch(`/api/reimbursements/${reversalTarget.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.success) {
        alert(result.message || '冲销成功');
        setReversalTarget(null);
        setReversalReason('');
        setReversalAmount('');
        setReversalCategory('full');
        fetchReimbursements();
        fetchPaymentStats();
      } else {
        alert(result.error || '冲销失败');
      }
    } catch (error) {
      alert('冲销处理失败');
    } finally {
      setReversalProcessing(false);
    }
  };

  const handleAdjustCategory = async () => {
    if (!adjustingItem || !adjustNewCategory) return;
    setAdjusting(true);
    try {
      const response = await fetch(
        `/api/reimbursements/${adjustingItem.reimbursementId}/items/${adjustingItem.itemId}/adjust-category`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: adjustNewCategory }),
        }
      );
      const result = await response.json();
      if (result.success) {
        // 本地更新：避免重新拉取整个列表
        setReimbursements((prev) =>
          prev.map((r) => {
            if (r.id !== adjustingItem.reimbursementId) return r;
            return {
              ...r,
              items: r.items.map((it) => {
                if (it.id !== adjustingItem.itemId) return it;
                return {
                  ...it,
                  category: result.data.category,
                  coaCode: result.data.coaCode,
                  coaName: result.data.coaName,
                };
              }),
            };
          })
        );
        setAdjustingItem(null);
        setAdjustNewCategory('');
      } else {
        alert(result.error || '调整科目失败');
      }
    } catch {
      alert('调整科目失败，请重试');
    } finally {
      setAdjusting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === reimbursements.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reimbursements.map(r => r.id));
    }
  };

  // Stats - 计算选中项的总金额
  const selectedTotal = reimbursements
    .filter(r => selectedIds.includes(r.id))
    .reduce((sum, r) => {
      const originalAmount = r.totalAmountInBaseCurrency || 0;
      return sum + (customPaymentAmounts[r.id] ?? originalAmount);
    }, 0);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  // 等待角色检查完成
  if (!roleChecked) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div className="text-gray-500">验证权限...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">付款处理</h1>
          <p className="text-sm text-gray-500 mt-1">
            审核报销表单，验证明细，处理付款
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="text-gray-600">
            <span className="mr-2">📊</span> 导出报表
          </Button>
          {selectedIds.length > 0 && (
            <>
              <Button
                onClick={processBatchReject}
                disabled={batchProcessing}
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {batchProcessing ? '处理中...' : (
                  <>
                    <span className="mr-2">✕</span>
                    批量驳回 ({selectedIds.length})
                  </>
                )}
              </Button>
              <Button
                onClick={processBatchPayment}
                disabled={batchProcessing}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md"
              >
                {batchProcessing ? '处理中...' : (
                  <>
                    <span className="mr-2">💳</span>
                    批量付款 ({selectedIds.length})
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <span>⚠️</span>
            {errorMessage}
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">待付款总额</p>
              <p className="text-2xl font-bold text-gray-900">
                ${paymentStats.pendingTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {paymentStats.pendingCount} 笔待处理
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl">
              💰
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">处理中</p>
              <p className="text-2xl font-bold text-gray-900">{paymentStats.processingCount}</p>
              <p className="text-xs text-gray-500 mt-1">正在打款</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-xl">
              ⏳
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">已付款</p>
              <p className="text-2xl font-bold text-gray-900">{paymentStats.totalPaidCount}</p>
              <p className="text-xs text-gray-500 mt-1">
                今日 {paymentStats.todayPaidCount} 笔
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-xl">
              ✅
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4 border-b">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setActiveTab('ready'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'ready'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            待付款
            {paymentStats.pendingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                {paymentStats.pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('processing'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'processing'
                ? 'text-purple-600 border-purple-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            处理中
            {paymentStats.processingCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-600 rounded-full">
                {paymentStats.processingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('history'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'history'
                ? 'text-green-600 border-green-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            付款历史
            {paymentStats.totalPaidCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-600 rounded-full">
                {paymentStats.totalPaidCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('advances'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'advances'
                ? 'text-amber-600 border-amber-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            预借款管理
          </button>
          <button
            onClick={() => { setActiveTab('receivables'); setSelectedIds([]); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'receivables'
                ? 'text-red-600 border-red-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            员工应收
          </button>
        </div>
        {activeTab === 'processing' && (
          <button
            onClick={refreshAllPayoutStatuses}
            disabled={refreshingStatus}
            className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {refreshingStatus ? '刷新中...' : '🔄 刷新状态'}
          </button>
        )}
      </div>

      {/* Advances Tab */}
      {activeTab === 'advances' && (
        <AdvancesPanel />
      )}

      {/* Receivables Tab */}
      {activeTab === 'receivables' && (
        <ReceivablesPanel />
      )}

      {/* Search & Filter */}
      {activeTab !== 'advances' && activeTab !== 'receivables' && (<><div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="搜索表单编号或员工..."
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <span className="mr-1">⚙️</span> 筛选
          </Button>
          <Button variant="outline" size="sm" className="text-gray-600">
            <span className="mr-1">↕️</span> 排序: 日期
          </Button>
        </div>
      </div>

      {/* Selected Info Bar */}
      {selectedIds.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-blue-700">
            已选择 <strong>{selectedIds.length}</strong> 项，
            总金额 <strong>${selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </p>
          <Button
            size="sm"
            onClick={() => setSelectedIds([])}
            variant="outline"
            className="text-blue-600 border-blue-300"
          >
            取消选择
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="flex-1 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">加载中...</div>
        ) : reimbursements.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
              {activeTab === 'ready' ? '📋' : activeTab === 'processing' ? '⏳' : '✅'}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {activeTab === 'ready' ? '没有待付款的报销' : activeTab === 'processing' ? '没有处理中的付款' : '暂无付款记录'}
            </h3>
            <p className="text-gray-500">
              {activeTab === 'ready' ? '审批通过的报销将在这里显示' : ''}
            </p>
          </div>
        ) : (
          <div className="overflow-auto h-full">
            {/* Table Header */}
            <div className={`grid ${activeTab === 'ready' ? 'grid-cols-[40px_140px_1fr_120px_100px_120px_100px_80px]' : 'grid-cols-[140px_1fr_120px_100px_120px_100px_80px]'} gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase sticky top-0`}>
              {activeTab === 'ready' && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === reimbursements.length && reimbursements.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                </div>
              )}
              <div>表单编号</div>
              <div>员工</div>
              <div>提交日期</div>
              <div>费用项</div>
              <div className="text-right">金额</div>
              <div className="text-center">状态</div>
              <div></div>
            </div>

            {/* Table Rows */}
            {reimbursements.map((item) => {
              const isExpanded = expandedId === item.id;
              const isSelected = selectedIds.includes(item.id);
              const formId = generateFormId(item.createdAt, item.id, item.isAdvance);
              const usdAmount = item.totalAmountInBaseCurrency || 0;

              return (
                <div key={item.id}>
                  {/* Main Row */}
                  <div className={`grid ${activeTab === 'ready' ? 'grid-cols-[40px_140px_1fr_120px_100px_120px_100px_80px]' : 'grid-cols-[140px_1fr_120px_100px_120px_100px_80px]'} gap-2 px-4 py-3.5 items-center border-b transition-colors ${
                    isExpanded ? 'bg-emerald-50' : isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}>
                    {/* Checkbox - only on ready tab */}
                    {activeTab === 'ready' && (
                      <div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600"
                        />
                      </div>
                    )}

                    {/* Form ID */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="text-left text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      {formId}
                    </button>

                    {/* Employee */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
                        {item.submitter?.name?.slice(0, 1) || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.submitter?.name || '用户'}</p>
                        <p className="text-xs text-gray-500">{item.submitter?.department || '未知部门'}</p>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-sm text-gray-600">
                      {formatDate(item.approvedAt || item.submittedAt || item.createdAt)}
                    </div>

                    {/* Subject */}
                    <div className="text-sm text-gray-900">
                      {item.isAdvance && (
                        <span className="inline-block mr-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded font-medium">预借款</span>
                      )}
                      {item.title}
                      {!item.isAdvance && (
                        <span className="ml-1 text-xs text-gray-500">{item.items?.length || 0} 项</span>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="text-center">
                      {activeTab === 'ready' && (
                        <Badge variant="success" className="bg-green-100 text-green-700">
                          ● Ready
                        </Badge>
                      )}
                      {activeTab === 'processing' && (() => {
                        const live = payoutStatuses[item.id];
                        const st = live?.status || 'pending_authorization';
                        const labels: Record<string, { text: string; cls: string }> = {
                          pending_authorization: { text: '待审批', cls: 'bg-amber-100 text-amber-700' },
                          authorized: { text: '已授权', cls: 'bg-blue-100 text-blue-700' },
                          signed: { text: '已签名', cls: 'bg-blue-100 text-blue-700' },
                          broadcasting: { text: '广播中', cls: 'bg-purple-100 text-purple-700' },
                        };
                        const info = labels[st] || { text: 'Processing', cls: 'bg-amber-100 text-amber-700' };
                        return (
                          <Badge className={info.cls}>
                            ● {info.text}
                          </Badge>
                        );
                      })()}
                      {activeTab === 'history' && (
                        item.status === 'reversed' ? (
                          <Badge className="bg-red-100 text-red-700">
                            ● 已冲销
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700">
                            ● Paid
                          </Badge>
                        )
                      )}
                    </div>

                    {/* Expand */}
                    <div className="text-center">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className={`text-gray-400 hover:text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-b px-4 py-5">
                      {/* Advance detail */}
                      {item.isAdvance ? (
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <span>💰</span> 预借款详情
                          </h4>
                          <div className="bg-white rounded-lg border p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">标题</span>
                              <span className="font-medium">{item.title}</span>
                            </div>
                            {item.advancePurpose && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">用途</span>
                                <span>{item.advancePurpose}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">申请人</span>
                              <span>{item.submitter?.name || '未知'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">金额</span>
                              <span className="font-bold">${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => processPayment(item.id)}
                              disabled={processing === item.id}
                              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                            >
                              {processing === item.id ? '处理中...' : '💳 确认付款'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                      <div className="grid grid-cols-[1fr_300px] gap-6">
                        {/* Left: Line Items */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              <span>📋</span> 报销明细 (REIMBURSEMENT BREAKDOWN)
                            </h4>
                          </div>
                          <div className="bg-white rounded-lg border overflow-hidden">
                            <div className="grid grid-cols-[100px_1fr_120px_100px] gap-2 px-4 py-2.5 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                              <div>日期</div>
                              <div>描述</div>
                              <div>类别</div>
                              <div className="text-right">金额</div>
                            </div>
                            {item.items?.map((lineItem, idx) => {
                              const catInfo = categoryLabels[lineItem.category] || categoryLabels.other;
                              const itemUsd = lineItem.amountInBaseCurrency || 0;
                              return (
                                <div key={idx} className={`grid grid-cols-[100px_1fr_120px_100px] gap-2 px-4 py-3 items-center ${
                                  idx < (item.items?.length || 0) - 1 ? 'border-b border-gray-100' : ''
                                }`}>
                                  <div className="text-sm text-gray-600">
                                    {formatDate(lineItem.date)}
                                  </div>
                                  <div className="text-sm text-gray-900">
                                    {lineItem.description || catInfo.label}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span
                                      className="text-xs px-2 py-1 rounded-full inline-block w-fit"
                                      style={{
                                        backgroundColor: `${catInfo.color}15`,
                                        color: catInfo.color
                                      }}
                                    >
                                      {catInfo.label}
                                    </span>
                                    {lineItem.coaCode && (
                                      <span className="text-xs text-gray-400 pl-1">{lineItem.coaCode}</span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAdjustingItem({
                                          reimbursementId: item.id,
                                          itemId: lineItem.id,
                                          currentCategory: lineItem.category,
                                          currentCoaCode: lineItem.coaCode,
                                          currentCoaName: lineItem.coaName,
                                        });
                                        setAdjustNewCategory(lineItem.category);
                                      }}
                                      className="text-xs text-blue-500 hover:text-blue-700 text-left pl-1 leading-tight"
                                    >
                                      调整科目
                                    </button>
                                  </div>
                                  <div className="text-right text-sm font-medium text-gray-900">
                                    ${itemUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              );
                            })}
                            {/* Total */}
                            <div className="grid grid-cols-[100px_1fr_120px_100px] gap-2 px-4 py-3 bg-gray-50 border-t">
                              <div></div>
                              <div className="text-sm font-semibold text-gray-700">Total Verified</div>
                              <div></div>
                              <div className="text-right text-sm font-bold text-gray-900">
                                ${usdAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </div>
                            </div>

                            {/* 财务打款金额编辑 - 仅在待付款tab显示 */}
                            {activeTab === 'ready' && (
                              <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-emerald-700">💳 打款金额</span>
                                    <span className="text-xs text-emerald-600">
                                      (可根据政策限额调整，不超过报销金额)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {editingAmountId === item.id ? (
                                      <>
                                        <span className="text-sm text-gray-600">$</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0.01"
                                          max={usdAmount}
                                          value={customPaymentAmounts[item.id] ?? usdAmount}
                                          onChange={(e) => {
                                            const value = parseFloat(e.target.value) || 0;
                                            setCustomAmount(item.id, value, usdAmount);
                                          }}
                                          className="w-28 px-2 py-1 text-right text-sm font-bold border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                          autoFocus
                                        />
                                        <button
                                          onClick={async () => {
                                            const amount = customPaymentAmounts[item.id] ?? usdAmount;
                                            const saved = await saveCustomAmount(item.id, amount);
                                            if (saved) {
                                              setEditingAmountId(null);
                                            }
                                          }}
                                          className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                        >
                                          确定
                                        </button>
                                        <button
                                          onClick={async () => {
                                            await resetCustomAmount(item.id);
                                            setEditingAmountId(null);
                                          }}
                                          className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                        >
                                          重置
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-lg font-bold text-emerald-700">
                                          ${getPaymentAmount(item).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                        {customPaymentAmounts[item.id] !== undefined && (
                                          <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                                            已调整
                                          </span>
                                        )}
                                        <button
                                          onClick={() => setEditingAmountId(item.id)}
                                          className="px-2 py-1 text-xs text-emerald-600 border border-emerald-300 rounded hover:bg-emerald-100"
                                        >
                                          ✏️ 修改
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {customPaymentAmounts[item.id] !== undefined && customPaymentAmounts[item.id] < usdAmount && (
                                  <p className="text-xs text-amber-600 mt-2">
                                    ⚠️ 打款金额已调整为 ${customPaymentAmounts[item.id].toFixed(2)}，
                                    比原金额少 ${(usdAmount - customPaymentAmounts[item.id]).toFixed(2)} USDC
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Attachments & Actions */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                            <span>📎</span> 单据附件 (SUPPORTING DOCS)
                          </h4>
                          <div className="space-y-2 mb-4">
                            {item.items?.filter(i => i.receiptUrl).map((lineItem, idx) => (
                              <div
                                key={idx}
                                onClick={() => handlePreviewReceipt(lineItem.receiptUrl)}
                                className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                              >
                                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                                  {(lineItem.receiptUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) || lineItem.receiptUrl?.startsWith('data:image/')) ? (
                                    <img src={lineItem.receiptUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-2xl">📄</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {lineItem.receiptFileName || `凭证 ${idx + 1}`}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {categoryLabels[lineItem.category]?.label || '其他'}
                                  </p>
                                </div>
                                <button
                                  className="text-gray-400 hover:text-blue-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePreviewReceipt(lineItem.receiptUrl);
                                  }}
                                >
                                  👁
                                </button>
                              </div>
                            ))}
                            {!item.items?.some(i => i.receiptUrl) && (
                              <div className="p-4 text-center text-gray-500 text-sm bg-white border rounded-lg">
                                暂无附件
                              </div>
                            )}
                          </div>

                          {item.items?.some(i => i.receiptUrl) && (
                            <button className="w-full text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1 mb-4">
                              <span>⬇️</span> 下载全部附件 (ZIP)
                            </button>
                          )}

                          {/* Action Buttons - only on Ready tab */}
                          {activeTab === 'ready' && (
                            <div className="flex gap-2 pt-2 border-t">
                              <Button
                                variant="outline"
                                onClick={() => rejectPayment(item.id)}
                                disabled={processing === item.id}
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                <span className="mr-1">✕</span> Reject Form
                              </Button>
                              <Button
                                onClick={() => processPayment(item.id)}
                                disabled={processing === item.id}
                                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                              >
                                {processing === item.id ? '处理中...' : (
                                  <>
                                    <span className="mr-1">💳</span> Process Payment
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          {/* Processing tab - show payout status & approval link */}
                          {activeTab === 'processing' && (() => {
                            // 使用 filter + 取最后一个，获取最新的 payout 记录
                            const allPayouts = (item.aiSuggestions || []).filter(
                              (s: any) => s.type === 'fluxa_payout_initiated'
                            );
                            const payoutInfo = allPayouts.length > 0 ? allPayouts[allPayouts.length - 1] : null;
                            const liveStatus = payoutStatuses[item.id];
                            const statusDesc = liveStatus?.statusDescription || '等待 Fluxa 钱包审批';
                            const approvalUrl = liveStatus?.approvalUrl || payoutInfo?.approvalUrl;
                            const isFailed = liveStatus?.status === 'failed' || liveStatus?.status === 'expired';
                            // 优先使用实际打款金额，而非原始报销金额
                            const usdAmt = payoutInfo?.amountUSDC || item.totalAmountInBaseCurrency || 0;

                            return (
                              <div className="pt-2 border-t space-y-2">
                                {isFailed ? (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm font-medium text-red-800 mb-1">
                                      打款失败
                                    </p>
                                    <p className="text-xs text-red-600">
                                      金额: ${usdAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                                    </p>
                                    {liveStatus?.errorMessage && (
                                      <p className="text-xs text-red-600 mt-1">
                                        原因: {liveStatus.errorMessage}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-sm font-medium text-amber-800 mb-1">
                                      {statusDesc}
                                    </p>
                                    <p className="text-xs text-amber-600">
                                      金额: ${usdAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                                    </p>
                                    {liveStatus?.txHash && (
                                      <p className="text-xs text-gray-500 mt-1 font-mono">
                                        TxHash: {liveStatus.txHash.slice(0, 10)}...{liveStatus.txHash.slice(-8)}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* 操作按钮 */}
                                <div className="flex gap-2">
                                  {approvalUrl && !isFailed && (
                                    <a
                                      href={approvalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 text-center py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                      前往 Fluxa 钱包审批
                                    </a>
                                  )}

                                  {/* 退回按钮 - 打款失败或等待审批时都可以退回 */}
                                  <Button
                                    variant="outline"
                                    onClick={() => rejectPayment(item.id)}
                                    disabled={processing === item.id}
                                    className={`${isFailed ? 'flex-1' : ''} text-red-600 border-red-200 hover:bg-red-50`}
                                  >
                                    <span className="mr-1">↩</span> 退回给员工
                                  </Button>
                                </div>

                                {isFailed && (
                                  <Button
                                    onClick={() => processPayment(item.id)}
                                    disabled={processing === item.id}
                                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                                  >
                                    {processing === item.id ? '处理中...' : (
                                      <>
                                        <span className="mr-1">🔄</span> 重新发起打款
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            );
                          })()}

                          {/* History tab - show paid info + reversal button */}
                          {activeTab === 'history' && (() => {
                            const payoutInfo = item.aiSuggestions?.find(
                              (s: any) => s.type === 'fluxa_payout_initiated'
                            );
                            const isReversed = item.status === 'reversed';
                            return (
                              <div className="pt-2 border-t space-y-2">
                                {isReversed ? (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-sm font-medium text-red-800 mb-1">
                                      已冲销
                                    </p>
                                    <div className="text-xs text-red-700 space-y-1">
                                      <p>原付款金额: ${(payoutInfo?.amountUSDC || item.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC</p>
                                      <p>该笔金额已转为员工应收</p>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                      <p className="text-sm font-medium text-green-800 mb-1">
                                        已完成付款
                                      </p>
                                      <div className="text-xs text-green-700 space-y-1">
                                        <p>金额: ${(payoutInfo?.amountUSDC || item.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC</p>
                                        {payoutInfo?.initiatedAt && (
                                          <p>发起时间: {formatDate(payoutInfo.initiatedAt)}</p>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      onClick={() => {
                                        setReversalTarget(item);
                                        setReversalAmount('');
                                        setReversalReason('');
                                        setReversalCategory('full');
                                      }}
                                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                                    >
                                      <span className="mr-1">↩</span> 冲销 (转为员工应收)
                                    </Button>
                                    <a
                                      href={`/dashboard/corrections?reimbId=${item.id}`}
                                      className="block w-full text-center text-sm font-medium py-1.5 px-3 rounded-md border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                                      style={{ textDecoration: 'none' }}
                                    >
                                      ⚠️ 标记金额有误（冲差）
                                    </a>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      </>)}

      {/* 财务调整入账科目 Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 9998 }}>
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-w-[90vw] p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">调整会计入账科目</h3>
            <p className="text-sm text-gray-500 mb-4">
              财务可对已审批报销单的费用行调整入账分类，调整后系统自动匹配对应科目代码。
            </p>

            <div className="space-y-4">
              {/* 当前科目 */}
              <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">当前分类</span>
                  <span className="font-medium">
                    {categoryLabels[adjustingItem.currentCategory]?.label || adjustingItem.currentCategory}
                  </span>
                </div>
                {adjustingItem.currentCoaCode && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">当前科目代码</span>
                    <span className="font-mono text-xs text-gray-700">{adjustingItem.currentCoaCode}</span>
                  </div>
                )}
                {adjustingItem.currentCoaName && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">当前科目名称</span>
                    <span className="text-gray-700">{adjustingItem.currentCoaName}</span>
                  </div>
                )}
              </div>

              {/* 新分类选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  调整为 <span className="text-red-500">*</span>
                </label>
                <select
                  value={adjustNewCategory}
                  onChange={(e) => setAdjustNewCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <optgroup label="差旅费 (6601)">
                    <option value="flight">机票 — 6601.01</option>
                    <option value="train">火车票 — 6601.02</option>
                    <option value="hotel">酒店住宿 — 6601.03</option>
                    <option value="meal">餐饮 — 6601.04</option>
                    <option value="taxi">市内交通 — 6601.05</option>
                    <option value="car_rental">租车 — 6601.06</option>
                    <option value="fuel">燃油费 — 6601.07</option>
                    <option value="parking">停车费 — 6601.08</option>
                    <option value="toll">过路费 — 6601.09</option>
                  </optgroup>
                  <optgroup label="办公费 (6602)">
                    <option value="office_supplies">办公用品 — 6602.01</option>
                    <option value="equipment">设备采购 — 6602.02</option>
                    <option value="software">软件订阅 — 6602.03</option>
                  </optgroup>
                  <optgroup label="技术费用 (6603)">
                    <option value="ai_token">AI 服务 — 6603.01</option>
                    <option value="cloud_resource">云资源 — 6603.02</option>
                    <option value="api_service">API 服务 — 6603.03</option>
                    <option value="hosting">托管服务 — 6603.04</option>
                    <option value="domain">域名费 — 6603.05</option>
                  </optgroup>
                  <optgroup label="行政费用 (6604)">
                    <option value="admin_general">行政综合 — 6604.01</option>
                    <option value="courier">快递费 — 6604.02</option>
                    <option value="printing">打印复印 — 6604.03</option>
                    <option value="phone">通讯费 — 6604.04</option>
                    <option value="internet">网络费 — 6604.05</option>
                    <option value="utilities">水电费 — 6604.06</option>
                  </optgroup>
                  <optgroup label="业务费用 (6605)">
                    <option value="client_entertainment">客户招待 — 6605.01</option>
                    <option value="marketing">市场推广 — 6605.02</option>
                    <option value="training">培训费 — 6605.03</option>
                    <option value="conference">会议费 — 6605.04</option>
                    <option value="membership">会员订阅 — 6605.05</option>
                  </optgroup>
                  <optgroup label="其他 (6699)">
                    <option value="other">其他费用 — 6699.01</option>
                  </optgroup>
                </select>
              </div>

              {/* 调整后科目预览 */}
              {adjustNewCategory && adjustNewCategory !== adjustingItem.currentCategory && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="text-blue-700 font-medium mb-1">调整后入账科目</p>
                  <p className="text-blue-600">
                    {categoryLabels[adjustNewCategory]?.label || adjustNewCategory}
                  </p>
                </div>
              )}

              {/* 按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setAdjustingItem(null); setAdjustNewCategory(''); }}
                  disabled={adjusting}
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleAdjustCategory}
                  disabled={!adjustNewCategory || adjustNewCategory === adjustingItem.currentCategory || adjusting}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {adjusting ? '保存中...' : '确认调整'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversalTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 9998 }}>
          <div className="bg-white rounded-xl shadow-2xl w-[500px] max-w-[90vw] p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">冲销确认</h3>
            <p className="text-sm text-gray-500 mb-4">
              将报销单 {generateFormId(reversalTarget.createdAt, reversalTarget.id)} 的付款冲销，金额转为员工应收
            </p>

            <div className="space-y-4">
              {/* 报销信息 */}
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">员工</span>
                  <span className="font-medium">{reversalTarget.submitter?.name || '未知'}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">标题</span>
                  <span className="font-medium">{reversalTarget.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">付款金额</span>
                  <span className="font-bold text-gray-900">
                    ${(reversalTarget.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC
                  </span>
                </div>
              </div>

              {/* 冲销类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">冲销类型</label>
                <div className="flex gap-2">
                  {[
                    { value: 'full', label: '全额冲销' },
                    { value: 'partial', label: '部分冲销' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReversalCategory(opt.value)}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        reversalCategory === opt.value
                          ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 部分冲销金额 */}
              {reversalCategory === 'partial' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">冲销金额 (USDC)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={reversalTarget.totalAmountInBaseCurrency || 0}
                    value={reversalAmount}
                    onChange={(e) => setReversalAmount(parseFloat(e.target.value) || '')}
                    placeholder={`最大 ${(reversalTarget.totalAmountInBaseCurrency || 0).toFixed(2)}`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              {/* 冲销原因 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">冲销原因 <span className="text-red-500">*</span></label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="请输入冲销原因，如：发票造假、金额不符、重复报销等"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>

              {/* 按钮 */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setReversalTarget(null)}
                  className="flex-1"
                  disabled={reversalProcessing}
                >
                  取消
                </Button>
                <Button
                  onClick={processReversal}
                  disabled={!reversalReason.trim() || reversalProcessing || (reversalCategory === 'partial' && (!reversalAmount || reversalAmount <= 0))}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {reversalProcessing ? '处理中...' : '确认冲销'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={closePreview}
          className="fixed inset-0 bg-black/85 flex items-center justify-center cursor-zoom-out"
          style={{ zIndex: 9999 }}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            {imgLoadError ? (
              <div className="text-center text-white p-10">
                <p className="mb-4 text-base">图片无法加载</p>
                <a
                  href={previewImage!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-400 underline text-sm"
                >
                  在新标签页中打开
                </a>
              </div>
            ) : (
              <img
                src={previewImage!}
                alt="凭证预览"
                onError={() => setImgLoadError(true)}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); closePreview(); }}
              className="absolute -top-10 right-0 text-white text-2xl p-2 hover:text-gray-300"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 预借款管理面板（嵌入付款处理页面）
 */
function AdvancesPanel() {
  const [advancesList, setAdvancesList] = useState<any[]>([]);
  const [advLoading, setAdvLoading] = useState(true);
  const [expandedAdvId, setExpandedAdvId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdvances();
  }, []);

  const fetchAdvances = async () => {
    setAdvLoading(true);
    try {
      const res = await fetch('/api/advances');
      const data = await res.json();
      if (data.success) setAdvancesList(data.data);
    } catch {} finally {
      setAdvLoading(false);
    }
  };

  const handleApprove = async (id: string, action: 'approve' | 'reject' | 'pay' | 'revert_pay') => {
    if (action === 'reject') {
      const reason = prompt('请输入拒绝原因');
      if (reason === null) return;
      try {
        await fetch(`/api/advances/${id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reason }),
        });
        fetchAdvances();
      } catch {}
      return;
    }
    // 付款走 Fluxa 支付流程
    if (action === 'pay') {
      if (!confirm('确认发起 Fluxa 付款？')) return;
      try {
        const res = await fetch(`/api/advances/${id}/process-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const result = await res.json();
        if (result.success) {
          if (result.approvalUrl) {
            window.open(result.approvalUrl, '_blank');
          }
          alert('预借款付款已提交，请在 Fluxa 钱包中完成审批');
          fetchAdvances();
        } else {
          alert(`付款失败: ${result.message || result.error || '未知错误'}`);
        }
      } catch {
        alert('付款请求失败');
      }
      return;
    }
    // 其他操作（approve, revert_pay）
    try {
      await fetch(`/api/advances/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchAdvances();
    } catch {}
  };

  const advStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: '待审批', color: '#d97706', bg: '#fef3c7' },
    approved: { label: '已批准', color: '#16a34a', bg: '#dcfce7' },
    paid: { label: '已打款', color: '#2563eb', bg: '#dbeafe' },
    reconciling: { label: '核销中', color: '#4f46e5', bg: '#e0e7ff' },
    reconciled: { label: '已核销', color: '#059669', bg: '#dcfce7' },
    rejected: { label: '已拒绝', color: '#dc2626', bg: '#fee2e2' },
    cancelled: { label: '已取消', color: '#6b7280', bg: '#f3f4f6' },
  };

  // 统计
  const pendingCount = advancesList.filter(a => a.status === 'pending').length;
  const pendingAmount = advancesList.filter(a => a.status === 'pending').reduce((s, a) => s + a.amount, 0);
  const outstandingAmount = advancesList
    .filter(a => ['approved', 'paid', 'reconciling'].includes(a.status))
    .reduce((s, a) => s + a.amount - (a.reconciledAmount || 0), 0);

  return (
    <div>
      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-1">待审批</div>
          <div className="text-xl font-bold text-amber-600">{pendingCount} 笔 / ${pendingAmount.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-1">待核销余额</div>
          <div className="text-xl font-bold text-blue-600">${outstandingAmount.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-1">总预借款笔数</div>
          <div className="text-xl font-bold text-gray-700">{advancesList.length}</div>
        </Card>
      </div>

      {/* 列表 */}
      <Card className="overflow-hidden">
        {advLoading ? (
          <div className="p-10 text-center text-gray-500">加载中...</div>
        ) : advancesList.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">💰</div>
            <div className="text-gray-500">暂无预借款记录</div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_100px_120px_120px_100px] gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
              <span>标题 / 申请人</span>
              <span>金额</span>
              <span>状态</span>
              <span>已核销</span>
              <span>申请日期</span>
              <span>操作</span>
            </div>
            {advancesList.map(adv => {
              const sc = advStatusConfig[adv.status] || advStatusConfig.pending;
              const remaining = adv.amount - (adv.reconciledAmount || 0);
              return (
                <div key={adv.id}>
                  <div
                    onClick={() => setExpandedAdvId(expandedAdvId === adv.id ? null : adv.id)}
                    className="grid grid-cols-[1fr_120px_100px_120px_120px_100px] gap-2 px-4 py-3 items-center border-b hover:bg-gray-50 cursor-pointer"
                  >
                    <div>
                      <div className="font-medium text-sm">{adv.title}</div>
                      {adv.user && <div className="text-xs text-gray-500">{adv.user.name}</div>}
                    </div>
                    <div className="font-semibold text-sm">${adv.amount.toFixed(2)}</div>
                    <div>
                      <span style={{ backgroundColor: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500 }}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="text-sm">
                      {adv.reconciledAmount > 0 ? (
                        <span className="text-green-600">${(adv.reconciledAmount || 0).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(adv.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    <div className="flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                      {adv.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(adv.id, 'approve')}
                            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                          >
                            批准
                          </button>
                          <button
                            onClick={() => handleApprove(adv.id, 'reject')}
                            className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                          >
                            拒绝
                          </button>
                        </>
                      )}
                      {adv.status === 'approved' && (
                        <>
                          <button
                            onClick={() => handleApprove(adv.id, 'pay')}
                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            付款
                          </button>
                          <button
                            onClick={() => handleApprove(adv.id, 'reject')}
                            className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                          >
                            驳回
                          </button>
                        </>
                      )}
                      {adv.status === 'paid' && !adv.paymentId && (
                        <button
                          onClick={() => {
                            if (confirm('该笔预借款无实际打款记录，确认撤回打款状态？')) {
                              handleApprove(adv.id, 'revert_pay' as any);
                            }
                          }}
                          className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                        >
                          撤回打款
                        </button>
                      )}
                      {['pending', 'approved', 'rejected', 'cancelled'].includes(adv.status) && (
                        <button
                          onClick={async () => {
                            if (!confirm(`确认删除预借款「${adv.title}」？此操作不可撤销。`)) return;
                            try {
                              const res = await fetch(`/api/advances/${adv.id}`, { method: 'DELETE' });
                              const result = await res.json();
                              if (result.success) {
                                fetchAdvances();
                              } else {
                                alert(result.error || '删除失败');
                              }
                            } catch {
                              alert('删除失败');
                            }
                          }}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 展开详情 */}
                  {expandedAdvId === adv.id && (
                    <div className="px-6 py-4 bg-gray-50 border-b">
                      {adv.purpose && <div className="text-sm mb-1"><strong>用途：</strong>{adv.purpose}</div>}
                      {adv.description && <div className="text-sm mb-1 text-gray-600">{adv.description}</div>}
                      {adv.rejectReason && (
                        <div className="text-sm text-red-600 mb-1">拒绝原因：{adv.rejectReason}</div>
                      )}
                      {remaining > 0.01 && ['approved', 'paid', 'reconciling'].includes(adv.status) && (
                        <div className="text-sm text-amber-600">待核销余额：${remaining.toFixed(2)}</div>
                      )}
                      {adv.reconciliations && adv.reconciliations.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-gray-500 mb-1">核销记录：</div>
                          {adv.reconciliations.map((r: any, i: number) => (
                            <div key={i} className="flex justify-between text-sm py-1 px-2 bg-white rounded mb-1">
                              <span>{r.reimbursement?.title || r.reimbursementId?.slice(0, 8)}</span>
                              <span className="text-green-600 font-medium">-${r.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * 员工应收管理面板（冲销产生的应收）
 */
function ReceivablesPanel() {
  const [receivables, setReceivables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalCount: 0, outstandingCount: 0, totalOutstanding: 0 });
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchReceivables();
  }, [filter]);

  const fetchReceivables = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/receivables?status=${filter}`);
      const data = await res.json();
      if (data.success) {
        setReceivables(data.data || []);
        setStats(data.stats || { totalCount: 0, outstandingCount: 0, totalOutstanding: 0 });
      }
    } catch (e) {
      console.error('Failed to fetch receivables:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (reversalId: string, action: 'repay' | 'waive', amount?: number) => {
    if (action === 'waive') {
      const reason = prompt('请输入豁免原因：');
      if (!reason) return;
      try {
        const res = await fetch('/api/receivables', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reversalId, action: 'waive', reason }),
        });
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          fetchReceivables();
        } else {
          alert(data.error || '操作失败');
        }
      } catch { alert('操作失败'); }
      return;
    }

    if (action === 'repay') {
      const input = prompt('请输入还款金额（留空表示全额还款）：');
      if (input === null) return;
      const repayAmount = input ? parseFloat(input) : undefined;
      try {
        const res = await fetch('/api/receivables', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reversalId, action: 'repay', amount: repayAmount }),
        });
        const data = await res.json();
        if (data.success) {
          alert(data.message);
          fetchReceivables();
        } else {
          alert(data.error || '操作失败');
        }
      } catch { alert('操作失败'); }
    }
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    outstanding: { label: '待收回', color: '#dc2626', bg: '#fee2e2' },
    partially_repaid: { label: '部分还款', color: '#d97706', bg: '#fef3c7' },
    repaid: { label: '已还清', color: '#16a34a', bg: '#dcfce7' },
    waived: { label: '已豁免', color: '#6b7280', bg: '#f3f4f6' },
  };

  return (
    <div>
      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card className="p-4 border-l-4 border-l-red-500">
          <div className="text-xs text-gray-500 mb-1">待收回总额</div>
          <div className="text-xl font-bold text-red-600">
            ${stats.totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-500 mt-1">{stats.outstandingCount} 笔未结清</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-1">总冲销笔数</div>
          <div className="text-xl font-bold text-gray-700">{stats.totalCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-1">筛选</div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="all">全部</option>
            <option value="outstanding">待收回</option>
            <option value="partially_repaid">部分还款</option>
            <option value="repaid">已还清</option>
            <option value="waived">已豁免</option>
          </select>
        </Card>
      </div>

      {/* 列表 */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">加载中...</div>
        ) : receivables.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-gray-500">暂无员工应收记录</div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_100px_120px_120px_140px] gap-2 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
              <span>员工 / 报销单</span>
              <span>应收金额</span>
              <span>状态</span>
              <span>已还款</span>
              <span>冲销日期</span>
              <span>操作</span>
            </div>
            {receivables.map((item: any) => {
              const sc = statusConfig[item.receivableStatus] || statusConfig.outstanding;
              const remaining = item.amount - item.repaidAmount;
              return (
                <div key={item.id} className="grid grid-cols-[1fr_120px_100px_120px_120px_140px] gap-2 px-4 py-3 items-center border-b hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-sm">{item.employeeName}</div>
                    <div className="text-xs text-gray-500">{item.reimbursementTitle}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{item.reason}</div>
                  </div>
                  <div className="font-semibold text-sm text-red-600">
                    ${item.amount.toFixed(2)}
                  </div>
                  <div>
                    <span style={{
                      backgroundColor: sc.bg,
                      color: sc.color,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500
                    }}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="text-sm">
                    {item.repaidAmount > 0 ? (
                      <span className="text-green-600">${item.repaidAmount.toFixed(2)}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                  <div className="flex gap-1">
                    {(item.receivableStatus === 'outstanding' || item.receivableStatus === 'partially_repaid') && (
                      <>
                        <button
                          onClick={() => handleAction(item.id, 'repay')}
                          className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          还款
                        </button>
                        <button
                          onClick={() => handleAction(item.id, 'waive')}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                        >
                          豁免
                        </button>
                      </>
                    )}
                    {item.receivableStatus === 'repaid' && (
                      <span className="text-xs text-green-600">已结清</span>
                    )}
                    {item.receivableStatus === 'waived' && (
                      <span className="text-xs text-gray-500" title={item.waivedReason}>已豁免</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
