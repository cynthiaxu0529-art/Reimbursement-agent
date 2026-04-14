'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
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
  rejectedAt?: string;
  rejectReason?: string;
  items: ReimbursementItem[];
  submitter?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    department?: string;
  };
}

const categoryLabels: Record<string, { label: string; icon: string }> = {
  flight: { label: '机票', icon: '✈️' },
  train: { label: '火车票', icon: '🚄' },
  hotel: { label: '酒店住宿', icon: '🏨' },
  meal: { label: '餐饮', icon: '🍽️' },
  taxi: { label: '交通', icon: '🚕' },
  office_supplies: { label: '办公用品', icon: '📎' },
  ai_token: { label: 'AI 服务', icon: '🤖' },
  cloud_resource: { label: '云资源', icon: '☁️' },
  software: { label: '软件订阅', icon: '💿' },
  client_entertainment: { label: '客户招待', icon: '🤝' },
  marketing: { label: '市场推广', icon: '📢' },
  content_seo: { label: '内容 & SEO', icon: '📝' },
  pr_communications: { label: '公关 & 传播', icon: '📰' },
  training: { label: '培训费', icon: '📚' },
  conference: { label: '会议/活动', icon: '🎤' },
  courier: { label: '快递费', icon: '📦' },
  phone: { label: '通讯费', icon: '📱' },
  other: { label: '其他', icon: '📋' },
};

const currencySymbols: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  HKD: 'HK$', SGD: 'S$', AUD: 'A$', CAD: 'C$', KRW: '₩',
};

// 根据日期和ID生成报销单编号
const generateAppId = (createdAt: string, id: string): string => {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const idNum = parseInt(id.slice(-4), 16) % 10000;
  return `#APP-${idNum.toString().padStart(4, '0')}`;
};

// 每项费用的限额（用于显示超标警告）
const categoryLimits: Record<string, number> = {
  hotel: 150, // 酒店每晚 $150
  meal: 50,   // 餐饮每次 $50
  office_supplies: 100, // 办公用品 $100
  taxi: 30,   // 交通 $30
  flight: 500,
  train: 200,
};

export default function ApprovalHistoryPage() {
  const router = useRouter();
  const [historyList, setHistoryList] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<Reimbursement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  const [roleChecked, setRoleChecked] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // 检查用户角色 - 从API获取而不是localStorage
  useEffect(() => {
    const checkRoles = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success && result.roles) {
          // 转换数据库角色到前端角色
          const dbToFrontend: Record<string, string> = {
            employee: 'employee',
            manager: 'approver',
            finance: 'finance',
            admin: 'admin',
            super_admin: 'super_admin',
          };
          const frontendRoles = result.roles.map((r: string) => dbToFrontend[r] || r);
          setUserRoles(frontendRoles);

          // 检查是否有审批权限（approver 或 super_admin）
          const hasApprovalAccess = frontendRoles.includes('approver') || frontendRoles.includes('super_admin');
          if (!hasApprovalAccess) {
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

  // 获取审批历史数据 - 只显示当前用户批准的记录
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        // 添加 myApprovals=true 只获取自己批准的记录
        const response = await fetch('/api/reimbursements?status=approved,rejected,paid,processing&role=approver&myApprovals=true');
        const result = await response.json();
        if (result.success) {
          setHistoryList(result.data || []);
        } else if (result.error === '无审批权限') {
          // 用户没有审批权限，跳转回首页
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Failed to fetch history:', error);
      } finally {
        setLoading(false);
      }
    };
    if (roleChecked) {
      fetchHistory();
    }
  }, [roleChecked, router]);

  // 获取选中项的详情
  useEffect(() => {
    if (!selectedId) {
      setSelectedData(null);
      return;
    }

    const listItem = historyList.find(r => r.id === selectedId);
    if (listItem) setSelectedData(listItem);

    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/reimbursements/${selectedId}`);
        const result = await response.json();
        if (result.success && result.data) {
          setSelectedData(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch detail:', error);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedId, historyList]);

  // 统计数据
  const stats = {
    totalApproved: historyList.filter(r => r.status === 'approved' || r.status === 'paid' || r.status === 'processing').length,
    totalRejected: historyList.filter(r => r.status === 'rejected').length,
    totalPaidAmount: historyList
      .filter(r => r.status === 'paid' || r.status === 'approved' || r.status === 'processing')
      .reduce((sum, r) => sum + (r.totalAmountInBaseCurrency || 0), 0),
  };

  // 搜索过滤
  const filteredList = historyList.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(query) ||
      item.submitter?.name?.toLowerCase().includes(query) ||
      generateAppId(item.createdAt, item.id).toLowerCase().includes(query)
    );
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
      case 'processing':
        return <Badge className="bg-green-100 text-green-700 border-0">APPROVED</Badge>;
      case 'paid':
        return <Badge className="bg-blue-100 text-blue-700 border-0">PAID</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700 border-0">REJECTED</Badge>;
      default:
        return <Badge variant="secondary">{status.toUpperCase()}</Badge>;
    }
  };

  // 检查费用项是否超标
  const checkExceedsLimit = (item: ReimbursementItem): boolean => {
    const limit = categoryLimits[item.category];
    if (!limit) return false;
    const amountUSD = item.amountInBaseCurrency || 0;
    return amountUSD > limit;
  };

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">审批历史</h1>
        <p className="text-sm text-gray-500 mt-1">
          查看完整的报销审批记录
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <span className="text-amber-500">●</span> 已批准
              </p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalApproved}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.totalRejected} 项已拒绝
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl">
              ✅
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <span className="text-green-500">●</span> 已批准总额
              </p>
              <p className="text-2xl font-bold text-gray-900">
                ${stats.totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">历史累计</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-xl">
              💰
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left: List */}
        <div className="w-1/2 flex flex-col">
          <Card className="flex-1 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input
                  type="text"
                  placeholder="搜索申请..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[100px_100px_1fr] gap-2 px-4 py-2.5 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
              <div>APP ID</div>
              <div>DATE</div>
              <div>REPORT NAME</div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-10 text-center text-gray-500">加载中...</div>
              ) : filteredList.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                    📋
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无审批记录</h3>
                  <p className="text-gray-500 text-sm">审批完成的报销将在这里显示</p>
                </div>
              ) : (
                filteredList.map((item) => {
                  const appId = generateAppId(item.createdAt, item.id);
                  const isSelected = selectedId === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`grid grid-cols-[100px_100px_1fr] gap-2 px-4 py-3 items-center border-b cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-sm font-medium text-blue-600">{appId}</div>
                      <div className="text-sm text-gray-600">{formatDate(item.submittedAt || item.createdAt)}</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.items?.length || 0} items</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right: Detail Panel */}
        <div className="w-1/2 flex flex-col">
          {!selectedId ? (
            <Card className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-3">👈</div>
                <p>选择一项申请查看详情</p>
              </div>
            </Card>
          ) : detailLoading || !selectedData ? (
            <Card className="flex-1 flex items-center justify-center">
              <div className="text-gray-500">加载中...</div>
            </Card>
          ) : (
            <Card className="flex-1 overflow-auto">
              {/* Detail Header */}
              <div className="p-4 border-b flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">ID: {generateAppId(selectedData.createdAt, selectedData.id)}</p>
                  <h2 className="text-lg font-bold text-gray-900">{selectedData.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Submitted on {formatDate(selectedData.submittedAt || selectedData.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedData.status)}
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-gray-400 hover:text-gray-600 text-xl"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Reject Reason */}
              {selectedData.status === 'rejected' && selectedData.rejectReason && (
                <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    <span className="font-semibold">拒绝原因：</span> {selectedData.rejectReason}
                  </p>
                </div>
              )}

              {/* Amount Summary */}
              <div className="p-4 grid grid-cols-2 gap-4 border-b">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">TOTAL CLAIMED</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    ${(selectedData.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">APPROVED PAYOUT</p>
                  <p className={`text-xl font-bold mt-1 ${
                    selectedData.status === 'rejected' ? 'text-red-500' : 'text-green-600'
                  }`}>
                    {selectedData.status === 'rejected'
                      ? '$0.00'
                      : `$${(selectedData.totalAmountInBaseCurrency || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    }
                  </p>
                </div>
              </div>

              {/* Line Items */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Line Items</h3>
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
                    {selectedData.items?.length || 0}
                  </span>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-[1fr_100px_80px_90px] gap-2 px-4 py-2.5 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                    <div>ITEM DETAILS</div>
                    <div className="text-right">RECEIPT AMT</div>
                    <div className="text-center">EXCH. RATE</div>
                    <div className="text-right">CONVERTED</div>
                  </div>

                  {/* Items */}
                  {selectedData.items?.map((item, idx) => {
                    const catInfo = categoryLabels[item.category] || categoryLabels.other;
                    const itemCurrency = item.currency || 'CNY';
                    const itemSymbol = currencySymbols[itemCurrency] || itemCurrency;
                    const exchangeRate = itemCurrency === 'USD' ? 1.000 : (item.amountInBaseCurrency && item.amount > 0 ? item.amountInBaseCurrency / item.amount : null);
                    const convertedAmount = item.amountInBaseCurrency || 0;
                    const exceedsLimit = checkExceedsLimit(item);

                    return (
                      <div
                        key={item.id || idx}
                        className={`grid grid-cols-[1fr_100px_80px_90px] gap-2 px-4 py-3 items-center ${
                          idx < (selectedData.items?.length || 0) - 1 ? 'border-b' : ''
                        }`}
                      >
                        {/* Item Details */}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{item.description || catInfo.label}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{catInfo.label}</span>
                            {item.vendor && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span className="text-xs text-gray-500">{item.vendor}</span>
                              </>
                            )}
                          </div>
                          {exceedsLimit && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-red-500 text-xs">⚠</span>
                              <span className="text-xs text-red-500">Exceeds limit</span>
                            </div>
                          )}
                          {item.receiptUrl && (
                            <button
                              onClick={() => handlePreviewReceipt(item.receiptUrl)}
                              className="flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-700"
                            >
                              📎 {item.receiptFileName || '查看凭证'}
                            </button>
                          )}
                        </div>

                        {/* Receipt Amount */}
                        <div className="text-right">
                          <p className="font-medium text-gray-900">
                            {itemSymbol}{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-gray-500">{itemCurrency}</p>
                        </div>

                        {/* Exchange Rate */}
                        <div className="text-center">
                          <p className="text-sm text-gray-600 font-mono">
                            {exchangeRate !== null ? exchangeRate.toFixed(3) : 'N/A'}
                          </p>
                        </div>

                        {/* Converted Amount */}
                        <div className="text-right">
                          <p className={`font-bold ${exceedsLimit ? 'text-red-500' : 'text-green-600'}`}>
                            ${convertedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                          {exceedsLimit && (
                            <p className="text-xs text-gray-400 line-through">
                              ${convertedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attachments */}
              {selectedData.items?.some(i => i.receiptUrl) && (
                <div className="p-4 border-t">
                  <button
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    ⬇️ 下载全部附件 (ZIP)
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={closePreview}
          className="fixed inset-0 bg-black/85 flex items-center justify-center cursor-zoom-out"
          style={{ zIndex: 9999 }}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={previewImage}
              alt="凭证预览"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
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
