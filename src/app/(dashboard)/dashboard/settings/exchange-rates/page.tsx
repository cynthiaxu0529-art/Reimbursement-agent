'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTenantConfig } from '@/hooks/useTenantConfig';
import { SUPPORTED_BASE_CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_NAMES } from '@/lib/currency/base-currency';
import { CurrencyType } from '@/types';

interface ExchangeRateRule {
  id: string;
  description: string;
  source: string;
  sourceIcon?: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'active' | 'draft' | 'archived';
  currencies: string[];
  fallbackRule?: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
  draftRule?: Partial<ExchangeRateRule>;
}

// 数据来源映射
const sourceIcons: Record<string, { icon: string; color: string; label: string }> = {
  central_bank: { icon: '🏛️', color: '#2563eb', label: 'Central Bank' },
  oanda: { icon: '📊', color: '#f59e0b', label: 'OANDA' },
  reuters: { icon: '📰', color: '#ef4444', label: 'Reuters' },
  open_exchange: { icon: '🌐', color: '#10b981', label: 'Open Exchange' },
  manual: { icon: '✏️', color: '#6b7280', label: 'Manual' },
  api: { icon: '🔗', color: '#8b5cf6', label: 'API' },
  // 兼容旧格式
  'Central Bank': { icon: '🏛️', color: '#2563eb', label: 'Central Bank' },
  'OANDA': { icon: '📊', color: '#f59e0b', label: 'OANDA' },
  'Reuters': { icon: '📰', color: '#ef4444', label: 'Reuters' },
  'Open Exchange': { icon: '🌐', color: '#10b981', label: 'Open Exchange' },
  'Manual': { icon: '✏️', color: '#6b7280', label: 'Manual' },
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: '#059669', bg: '#d1fae5' },
  draft: { label: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
  archived: { label: 'Archived', color: '#9ca3af', bg: '#f3f4f6' },
};

export default function ExchangeRatesPage() {
  const [rules, setRules] = useState<ExchangeRateRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // 本位币配置
  const {
    baseCurrency,
    loading: configLoading,
    updateBaseCurrency,
  } = useTenantConfig();
  const [selectedBaseCurrency, setSelectedBaseCurrency] = useState<CurrencyType | ''>('');
  const [baseCurrencyUpdating, setBaseCurrencyUpdating] = useState(false);

  // 同步选中的本位币
  useEffect(() => {
    if (baseCurrency && !selectedBaseCurrency) {
      setSelectedBaseCurrency(baseCurrency);
    }
  }, [baseCurrency, selectedBaseCurrency]);

  // 更新本位币
  const handleBaseCurrencyChange = async (currency: CurrencyType) => {
    if (currency === baseCurrency) return;

    const confirmed = confirm(
      `确定要将记账本位币从 ${CURRENCY_NAMES[baseCurrency]?.zh || baseCurrency} 更改为 ${CURRENCY_NAMES[currency]?.zh || currency} 吗？\n\n注意：更改后，所有新的报销单将以新本位币计算折算金额。`
    );

    if (!confirmed) {
      setSelectedBaseCurrency(baseCurrency);
      return;
    }

    setBaseCurrencyUpdating(true);
    const success = await updateBaseCurrency(currency);
    setBaseCurrencyUpdating(false);

    if (success) {
      setSelectedBaseCurrency(currency);
      alert('本位币已更新');
    } else {
      setSelectedBaseCurrency(baseCurrency);
      alert('更新失败，请重试');
    }
  };
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我可以帮助你配置汇率规则。\n\n请告诉我你的需求，例如："设置 CNY/USD 汇率来源为中国人民银行，从下月开始生效，如果获取失败使用前一天的收盘价。"',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // 从 API 获取汇率规则
  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/exchange-rate-rules?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.rules) {
          setRules(
            data.rules.map((rule: ExchangeRateRule) => ({
              ...rule,
              effectiveFrom: rule.effectiveFrom
                ? new Date(rule.effectiveFrom).toISOString().split('T')[0]
                : '',
              effectiveTo: rule.effectiveTo
                ? new Date(rule.effectiveTo).toISOString().split('T')[0]
                : '',
              createdAt: rule.createdAt
                ? new Date(rule.createdAt).toISOString().split('T')[0]
                : '',
            }))
          );
        }
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate rules:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openDropdown]);

  // Stats
  const stats = {
    activeRules: rules.filter(r => r.status === 'active').length,
    currenciesCovered: [...new Set(rules.flatMap(r => r.currencies))].length,
    lastSync: '2 分钟前',
    pendingUpdates: rules.filter(r => r.status === 'draft').length,
  };

  const filteredRules = rules.filter(rule => {
    const matchSearch = !search ||
      rule.description.toLowerCase().includes(search.toLowerCase()) ||
      rule.id.toLowerCase().includes(search.toLowerCase());
    const matchSource = sourceFilter === 'all' || rule.source === sourceFilter;
    const matchStatus = statusFilter === 'all' || rule.status === statusFilter;
    return matchSearch && matchSource && matchStatus;
  });

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '我已根据你的需求起草了一条规则。请查看下方的规则详情，确认后我会将其添加到表格中。',
        timestamp: new Date().toISOString(),
        draftRule: {
          id: `R-${new Date().getFullYear()}-${String(rules.length + 1).padStart(3, '0')}`,
          description: chatInput.includes('CNY') ? 'CNY 汇率标准规则' : '自定义汇率规则',
          source: chatInput.includes('央行') || chatInput.includes('人民银行') ? 'Central Bank' : 'OANDA',
          status: 'draft',
          currencies: ['CNY', 'USD'],
          effectiveFrom: new Date().toISOString().split('T')[0],
          effectiveTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          fallbackRule: '使用前一天收盘价',
        },
      };
      setChatMessages(prev => [...prev, aiResponse]);
      setChatLoading(false);
    }, 1500);
  };

  // 通过 API 创建新规则
  const addDraftRule = async (draftRule: Partial<ExchangeRateRule>) => {
    try {
      const response = await fetch('/api/exchange-rate-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: draftRule.description || '新汇率规则',
          source: draftRule.source?.toLowerCase().replace(' ', '_') || 'manual',
          currencies: draftRule.currencies || [],
          effectiveFrom: draftRule.effectiveFrom || new Date().toISOString(),
          effectiveTo: draftRule.effectiveTo || null,
          fallbackRule: draftRule.fallbackRule || null,
          status: 'draft',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // 刷新规则列表
          await fetchRules();

          const confirmMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `已添加规则 "${draftRule.description}" 到列表中。规则状态为草稿，你可以在表格中编辑并激活它。`,
            timestamp: new Date().toISOString(),
          };
          setChatMessages((prev) => [...prev, confirmMessage]);
        }
      } else {
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '抱歉，添加规则失败。请稍后重试。',
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Failed to add rule:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '抱歉，添加规则时发生错误。请检查网络连接后重试。',
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    }
  };

  // 更新规则状态
  const updateRuleStatus = async (ruleId: string, newStatus: 'active' | 'draft' | 'archived') => {
    try {
      const response = await fetch(`/api/exchange-rate-rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        await fetchRules();
      }
    } catch (error) {
      console.error('Failed to update rule status:', error);
    }
  };

  // 删除规则
  const deleteRule = async (ruleId: string) => {
    if (!confirm('确定要删除这条规则吗？')) return;

    try {
      const response = await fetch(`/api/exchange-rate-rules/${ruleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchRules();
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '未设置';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-100px)]">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">汇率规则配置</h1>
            <p className="text-sm text-gray-500 mt-1">
              配置汇率数据来源、生效日期和回退逻辑，支持 AI 辅助设置
            </p>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-gray-900 hover:bg-gray-800 text-white"
          >
            <span className="mr-2">✏️</span> 手动添加
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-green-600">✓</span>
              </div>
              <div>
                <p className="text-xs text-green-600 font-medium">Active Rules</p>
                <p className="text-2xl font-bold text-gray-900">{stats.activeRules}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600">$</span>
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Currencies Covered</p>
                <p className="text-2xl font-bold text-gray-900">{stats.currenciesCovered}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-purple-600">↻</span>
              </div>
              <div>
                <p className="text-xs text-purple-600 font-medium">Last Sync</p>
                <p className="text-2xl font-bold text-gray-900">{stats.lastSync}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="text-amber-600">⏳</span>
              </div>
              <div>
                <p className="text-xs text-amber-600 font-medium">Pending Updates</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingUpdates}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Base Currency Configuration */}
        <Card className="p-4 mb-6 border-2 border-blue-100 bg-blue-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <span className="text-2xl">{CURRENCY_SYMBOLS[baseCurrency] || '$'}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">记账本位币</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  所有报销金额将折算为此货币。当前：
                  <span className="font-medium text-blue-600 ml-1">
                    {CURRENCY_NAMES[baseCurrency]?.zh || baseCurrency} ({baseCurrency})
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedBaseCurrency}
                onChange={(e) => handleBaseCurrencyChange(e.target.value as CurrencyType)}
                disabled={configLoading || baseCurrencyUpdating}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[180px]"
              >
                {SUPPORTED_BASE_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {CURRENCY_SYMBOLS[currency]} {currency} - {CURRENCY_NAMES[currency]?.zh}
                  </option>
                ))}
              </select>
              {baseCurrencyUpdating && (
                <span className="text-xs text-blue-600">保存中...</span>
              )}
            </div>
          </div>
        </Card>

        {/* Search & Filters */}
        <Card className="p-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Search Rules</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by description..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="w-48">
              <label className="text-xs text-gray-500 mb-1 block">Filter by Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Sources</option>
                <option value="Central Bank">Central Bank</option>
                <option value="OANDA">OANDA</option>
                <option value="Reuters">Reuters</option>
                <option value="Open Exchange">Open Exchange</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
            <div className="w-36">
              <label className="text-xs text-gray-500 mb-1 block">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className="flex-1 overflow-hidden">
          <div className="overflow-auto h-full">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-xs font-semibold text-gray-500 uppercase">
                  <th className="text-left px-4 py-3">Rule Description</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Effective Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule, idx) => {
                  const sourceInfo = sourceIcons[rule.source] || sourceIcons['Manual'];
                  const statusInfo = statusConfig[rule.status];

                  return (
                    <tr key={rule.id} className={`border-t hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{rule.description}</p>
                        <p className="text-xs text-blue-600">ID: {rule.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded flex items-center justify-center text-xs"
                            style={{ backgroundColor: `${sourceInfo.color}20`, color: sourceInfo.color }}
                          >
                            {sourceInfo.icon}
                          </span>
                          <span className="text-sm text-gray-700">{rule.source}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(rule.effectiveFrom)} - {formatDate(rule.effectiveTo)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-medium px-2 py-1 rounded-full"
                          style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center relative">
                        <button
                          className="text-gray-400 hover:text-gray-600 p-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdown(openDropdown === rule.id ? null : rule.id);
                          }}
                        >
                          ⋮
                        </button>
                        {openDropdown === rule.id && (
                          <div
                            className="absolute right-4 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {rule.status !== 'active' && (
                              <button
                                className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => {
                                  updateRuleStatus(rule.id, 'active');
                                  setOpenDropdown(null);
                                }}
                              >
                                <span>✓</span> 激活
                              </button>
                            )}
                            {rule.status === 'active' && (
                              <button
                                className="w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => {
                                  updateRuleStatus(rule.id, 'archived');
                                  setOpenDropdown(null);
                                }}
                              >
                                <span>📁</span> 归档
                              </button>
                            )}
                            {rule.status === 'archived' && (
                              <button
                                className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => {
                                  updateRuleStatus(rule.id, 'draft');
                                  setOpenDropdown(null);
                                }}
                              >
                                <span>✏️</span> 转为草稿
                              </button>
                            )}
                            <button
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50 flex items-center gap-2"
                              onClick={() => {
                                deleteRule(rule.id);
                                setOpenDropdown(null);
                              }}
                            >
                              <span>🗑️</span> 删除
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredRules.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <p>没有找到匹配的规则</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="border-t px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <p>显示 1 到 {filteredRules.length} 共 {filteredRules.length} 条结果</p>
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50" disabled>
                &lt;
              </button>
              <button className="px-3 py-1 bg-blue-600 text-white rounded">1</button>
              <button className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50" disabled>
                &gt;
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Assistant Panel */}
      <Card className="w-80 flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-600">✨</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">AI 汇率助手</p>
              <p className="text-xs text-gray-500">智能配置汇率规则</p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600">↻</button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {chatMessages.map((msg) => (
            <div key={msg.id}>
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>
              </div>
              <p className={`text-[10px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </p>

              {/* Draft Rule Card */}
              {msg.draftRule && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-semibold text-blue-600 mb-2">DRAFT RULE</p>
                  <div className="space-y-1 text-xs text-gray-600">
                    <p><strong>描述:</strong> {msg.draftRule.description}</p>
                    <p><strong>来源:</strong> {msg.draftRule.source}</p>
                    <p><strong>货币:</strong> {msg.draftRule.currencies?.join(', ')}</p>
                    {msg.draftRule.fallbackRule && (
                      <p><strong>回退规则:</strong> {msg.draftRule.fallbackRule}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addDraftRule(msg.draftRule!)}
                    className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  >
                    添加到规则列表
                  </Button>
                </div>
              )}
            </div>
          ))}

          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500">
                正在思考...
              </div>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
              placeholder="描述你的汇率规则需求..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              onClick={handleChatSubmit}
              disabled={!chatInput.trim() || chatLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3"
            >
              →
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
