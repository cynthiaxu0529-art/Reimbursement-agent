/**
 * 租户配置 Hook
 *
 * 获取当前租户的配置信息，包括本位币设置
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CurrencyType, Currency } from '@/types';

interface TenantConfig {
  /** 公司名称 */
  name: string;
  /** 记账本位币 */
  baseCurrency: CurrencyType;
  /** 自动审批限额 */
  autoApproveLimit: number;
  /** 部门列表 */
  departments: string[];
}

interface UseTenantConfigReturn {
  /** 租户配置 */
  config: TenantConfig | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 记账本位币（快捷访问） */
  baseCurrency: CurrencyType;
  /** 刷新配置 */
  refresh: () => Promise<void>;
  /** 更新本位币 */
  updateBaseCurrency: (currency: CurrencyType) => Promise<boolean>;
}

// 默认本位币（未登录或获取失败时使用）
const DEFAULT_BASE_CURRENCY: CurrencyType = Currency.USD;

// 全局缓存，避免多个组件重复请求
let globalConfigCache: TenantConfig | null = null;
let globalCacheTime: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 租户配置 Hook
 *
 * 提供租户配置的读取和更新功能
 */
export function useTenantConfig(): UseTenantConfigReturn {
  const [config, setConfig] = useState<TenantConfig | null>(globalConfigCache);
  const [loading, setLoading] = useState(!globalConfigCache);
  const [error, setError] = useState<Error | null>(null);

  const fetchConfig = useCallback(async () => {
    // 检查缓存是否有效
    if (globalConfigCache && Date.now() - globalCacheTime < CACHE_DURATION_MS) {
      setConfig(globalConfigCache);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/company');

      if (!response.ok) {
        if (response.status === 401) {
          // 未登录，使用默认值
          setConfig(null);
          return;
        }
        throw new Error(`获取配置失败: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        const tenantConfig: TenantConfig = {
          name: data.data.name || '',
          baseCurrency: (data.data.currency as CurrencyType) || DEFAULT_BASE_CURRENCY,
          autoApproveLimit: data.data.autoApproveLimit || 0,
          departments: data.data.departments || [],
        };

        // 更新全局缓存
        globalConfigCache = tenantConfig;
        globalCacheTime = Date.now();

        setConfig(tenantConfig);
      }
    } catch (err) {
      console.error('获取租户配置失败:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * 更新本位币配置
   */
  const updateBaseCurrency = useCallback(async (currency: CurrencyType): Promise<boolean> => {
    try {
      const response = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency }),
      });

      if (!response.ok) {
        throw new Error('更新失败');
      }

      const data = await response.json();

      if (data.success) {
        // 清除缓存并刷新
        globalConfigCache = null;
        globalCacheTime = 0;
        await fetchConfig();
        return true;
      }

      return false;
    } catch (err) {
      console.error('更新本位币失败:', err);
      setError(err as Error);
      return false;
    }
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    baseCurrency: config?.baseCurrency || DEFAULT_BASE_CURRENCY,
    refresh: fetchConfig,
    updateBaseCurrency,
  };
}

/**
 * 清除租户配置缓存
 * 用于登录/登出时刷新配置
 */
export function clearTenantConfigCache(): void {
  globalConfigCache = null;
  globalCacheTime = 0;
}

export default useTenantConfig;
