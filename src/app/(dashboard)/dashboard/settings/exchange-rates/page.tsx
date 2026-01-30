'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantConfig } from '@/hooks/useTenantConfig';
import { SUPPORTED_BASE_CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_NAMES } from '@/lib/currency/base-currency';
import { CurrencyType } from '@/types';

interface ExchangeRate {
  currency: string;
  rate: number;
  source: 'system' | 'custom';
}

interface CustomRate {
  currency: string;
  rateToCNY: number;
  updatedAt: string;
}

export default function ExchangeRatesPage() {
  // 本位币配置
  const {
    baseCurrency,
    loading: configLoading,
    updateBaseCurrency,
  } = useTenantConfig();
  const [selectedBaseCurrency, setSelectedBaseCurrency] = useState<CurrencyType | ''>('');
  const [baseCurrencyUpdating, setBaseCurrencyUpdating] = useState(false);

  // 汇率数据
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);

  // 自定义货币
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customCurrencyCode, setCustomCurrencyCode] = useState('');
  const [customRateToCNY, setCustomRateToCNY] = useState('');
  const [customCurrencyAdding, setCustomCurrencyAdding] = useState(false);
  const [customCurrencyError, setCustomCurrencyError] = useState('');
  const [customRates, setCustomRates] = useState<CustomRate[]>([]);

  // 同步选中的本位币
  useEffect(() => {
    if (baseCurrency && !selectedBaseCurrency) {
      setSelectedBaseCurrency(baseCurrency);
    }
  }, [baseCurrency, selectedBaseCurrency]);

  // 获取汇率数据
  const fetchRates = useCallback(async () => {
    try {
      setRatesLoading(true);
      // 获取所有货币对 CNY 的汇率
      const response = await fetch('/api/exchange-rates?target=CNY');
      if (response.ok) {
        const data = await response.json();
        if (data.rates) {
          // API 返回格式: { currency: { rate: number, source: string } }
          const rateList: ExchangeRate[] = Object.entries(data.rates).map(([currency, rateInfo]) => {
            const info = rateInfo as { rate: number; source: string };
            return {
              currency,
              rate: info.rate,
              source: (info.source === 'manual' || info.source === 'manual_calculated') ? 'custom' : 'system',
            };
          });
          // 按货币代码排序
          rateList.sort((a, b) => a.currency.localeCompare(b.currency));
          setRates(rateList);
        }
      }
    } catch (error) {
      console.error('Failed to fetch rates:', error);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  // 获取自定义汇率
  const fetchCustomRates = useCallback(async () => {
    try {
      const response = await fetch('/api/exchange-rates/custom');
      if (response.ok) {
        const data = await response.json();
        if (data.rates) {
          setCustomRates(data.rates);
        }
      }
    } catch (error) {
      console.error('Failed to fetch custom rates:', error);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    fetchCustomRates();
  }, [fetchRates, fetchCustomRates]);

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

  // 添加自定义货币汇率
  const handleAddCustomCurrency = async () => {
    if (!customCurrencyCode || customCurrencyCode.length !== 3) {
      setCustomCurrencyError('货币代码必须是3位大写字母');
      return;
    }

    const rate = parseFloat(customRateToCNY);
    if (isNaN(rate) || rate <= 0) {
      setCustomCurrencyError('汇率必须是大于0的数字');
      return;
    }

    setCustomCurrencyAdding(true);
    setCustomCurrencyError('');

    try {
      const response = await fetch('/api/exchange-rates/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: customCurrencyCode,
          rateToCNY: rate,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCustomCurrencyCode('');
        setCustomRateToCNY('');
        setShowCustomForm(false);
        alert(`货币 ${customCurrencyCode} 汇率已添加`);
        fetchRates();
        fetchCustomRates();
      } else {
        setCustomCurrencyError(data.error || '添加失败，请重试');
      }
    } catch (error) {
      console.error('添加自定义货币失败:', error);
      setCustomCurrencyError('网络错误，请重试');
    } finally {
      setCustomCurrencyAdding(false);
    }
  };

  // 删除自定义汇率
  const handleDeleteCustomRate = async (currency: string) => {
    if (!confirm(`确定要删除 ${currency} 的自定义汇率吗？`)) return;

    try {
      const response = await fetch(`/api/exchange-rates/custom?currency=${currency}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchRates();
        fetchCustomRates();
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">汇率设置</h1>
        <p className="text-sm text-gray-500 mt-1">
          配置记账本位币和管理货币汇率
        </p>
      </div>

      {/* 记账本位币 - 最重要的配置 */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {CURRENCY_SYMBOLS[baseCurrency] || '$'}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">记账本位币</h2>
              <p className="text-sm text-gray-500 mt-1">
                所有报销金额将自动折算为此货币进行核算
              </p>
              <p className="text-xs text-gray-400 mt-2">
                当前设置：<span className="font-medium text-blue-600">{CURRENCY_NAMES[baseCurrency]?.zh || baseCurrency} ({baseCurrency})</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedBaseCurrency}
              onChange={(e) => handleBaseCurrencyChange(e.target.value as CurrencyType)}
              disabled={configLoading || baseCurrencyUpdating}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px] shadow-sm"
            >
              {SUPPORTED_BASE_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {CURRENCY_SYMBOLS[currency]} {currency} - {CURRENCY_NAMES[currency]?.zh}
                </option>
              ))}
            </select>
            {baseCurrencyUpdating && (
              <span className="text-sm text-blue-600">保存中...</span>
            )}
          </div>
        </div>
      </Card>

      {/* 当前汇率列表 */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">当前汇率</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              系统支持的货币及其兑换人民币汇率（每月初自动更新）
            </p>
          </div>
          <Button
            onClick={() => setShowCustomForm(!showCustomForm)}
            variant="outline"
            size="sm"
            className="text-sm"
          >
            {showCustomForm ? '取消' : '+ 添加货币'}
          </Button>
        </div>

        {/* 添加自定义货币表单 */}
        {showCustomForm && (
          <div className="p-4 bg-amber-50 border-b border-amber-100">
            <div className="flex items-end gap-3">
              <div className="w-24">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">货币代码</label>
                <input
                  type="text"
                  value={customCurrencyCode}
                  onChange={(e) => setCustomCurrencyCode(e.target.value.toUpperCase().slice(0, 3))}
                  placeholder="THB"
                  maxLength={3}
                  className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                  1 单位该货币 = ? 人民币
                </label>
                <input
                  type="number"
                  value={customRateToCNY}
                  onChange={(e) => setCustomRateToCNY(e.target.value)}
                  placeholder="0.21（如1泰铢=0.21元）"
                  step="0.0001"
                  min="0"
                  className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
              <Button
                onClick={handleAddCustomCurrency}
                disabled={!customCurrencyCode || !customRateToCNY || customCurrencyAdding}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {customCurrencyAdding ? '添加中...' : '添加'}
              </Button>
            </div>
            {customCurrencyError && (
              <p className="text-xs text-red-500 mt-2">{customCurrencyError}</p>
            )}
            <p className="text-xs text-gray-500 mt-3">
              常用货币代码：THB (泰铢)、MYR (林吉特)、VND (越南盾)、PHP (比索)、IDR (印尼盾)、SGD (新加坡元)
            </p>
          </div>
        )}

        {/* 汇率表格 */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">货币</th>
                <th className="text-left px-4 py-3 font-medium">代码</th>
                <th className="text-right px-4 py-3 font-medium">兑人民币汇率</th>
                <th className="text-center px-4 py-3 font-medium">来源</th>
                <th className="text-center px-4 py-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ratesLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : rates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    暂无汇率数据
                  </td>
                </tr>
              ) : (
                rates.map((rate) => {
                  const isCustom = rate.source === 'custom';
                  const currencyName = CURRENCY_NAMES[rate.currency as CurrencyType];
                  return (
                    <tr key={rate.currency} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">
                            {CURRENCY_SYMBOLS[rate.currency as CurrencyType] || rate.currency.charAt(0)}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {currencyName?.zh || currencyName?.en || rate.currency}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 font-mono">{rate.currency}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900">
                          {rate.rate.toFixed(4)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">CNY</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isCustom ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            手动
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            系统
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isCustom && (
                          <button
                            onClick={() => handleDeleteCustomRate(rate.currency)}
                            className="text-red-500 hover:text-red-700 text-sm"
                            title="删除"
                          >
                            删除
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 使用说明 */}
      <Card className="p-4 bg-gray-50 border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">使用说明</h3>
        <ul className="text-xs text-gray-500 space-y-1.5">
          <li>• <strong>记账本位币</strong>：公司核算使用的货币，所有报销金额会自动折算为此货币</li>
          <li>• <strong>系统汇率</strong>：每月初自动获取各主要货币对人民币的汇率</li>
          <li>• <strong>手动添加</strong>：当员工报销的货币不在系统中时，可手动添加汇率</li>
          <li>• 汇率换算公式：报销金额(原币) × 汇率(兑CNY) ÷ 本位币汇率(兑CNY) = 折算金额(本位币)</li>
        </ul>
      </Card>
    </div>
  );
}
