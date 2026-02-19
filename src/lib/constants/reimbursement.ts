/**
 * 报销系统统一常量定义
 * 所有模块共享的状态分组、币种工具等，确保数据口径一致
 */

// ============================================================================
// 状态分组定义（统一口径）
// ============================================================================

/** 待处理状态：员工视角"审批中"，审批人视角"待审批" */
export const PENDING_STATUSES = ['pending', 'under_review'] as const;

/** 已批准状态：仅审批通过但尚未付款 */
export const APPROVED_STATUSES = ['approved'] as const;

/** 处理中状态：正在打款 */
export const PROCESSING_STATUSES = ['processing'] as const;

/** 已付款状态：打款完成 */
export const PAID_STATUSES = ['paid'] as const;

/** 已拒绝状态 */
export const REJECTED_STATUSES = ['rejected'] as const;

/** 草稿状态 */
export const DRAFT_STATUSES = ['draft'] as const;

/** 已取消状态 */
export const CANCELLED_STATUSES = ['cancelled'] as const;

/** 所有"活跃"状态（非草稿、非取消）：用于统计累计金额等场景 */
export const ACTIVE_STATUSES = [
  ...PENDING_STATUSES,
  ...APPROVED_STATUSES,
  ...PROCESSING_STATUSES,
  ...PAID_STATUSES,
  ...REJECTED_STATUSES,
] as const;

/** 审批历史中"已批准"范畴：approved + processing + paid（审批通过且未撤回的） */
export const APPROVAL_PASSED_STATUSES = [
  ...APPROVED_STATUSES,
  ...PROCESSING_STATUSES,
  ...PAID_STATUSES,
] as const;

// ============================================================================
// 状态判断工具函数
// ============================================================================

export function isPendingStatus(status: string): boolean {
  return (PENDING_STATUSES as readonly string[]).includes(status);
}

export function isApprovedStatus(status: string): boolean {
  return (APPROVED_STATUSES as readonly string[]).includes(status);
}

export function isProcessingStatus(status: string): boolean {
  return (PROCESSING_STATUSES as readonly string[]).includes(status);
}

export function isPaidStatus(status: string): boolean {
  return (PAID_STATUSES as readonly string[]).includes(status);
}

export function isRejectedStatus(status: string): boolean {
  return (REJECTED_STATUSES as readonly string[]).includes(status);
}

export function isDraftStatus(status: string): boolean {
  return (DRAFT_STATUSES as readonly string[]).includes(status);
}

export function isApprovalPassedStatus(status: string): boolean {
  return (APPROVAL_PASSED_STATUSES as readonly string[]).includes(status);
}

// ============================================================================
// 币种工具
// ============================================================================

/** 币种符号映射 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  KRW: '₩',
};

/**
 * 获取本位币金额，不使用硬编码汇率回退
 * 当 totalAmountInBaseCurrency 缺失时返回 null，由调用方决定展示 "N/A" 或其他处理
 */
export function getBaseCurrencyAmount(
  totalAmountInBaseCurrency: number | null | undefined,
  totalAmount: number,
): number | null {
  // 优先使用已转换的本位币金额
  if (totalAmountInBaseCurrency != null && totalAmountInBaseCurrency > 0) {
    return totalAmountInBaseCurrency;
  }
  // 没有本位币金额时返回 null（不使用硬编码汇率）
  return null;
}

/**
 * 格式化本位币金额展示
 * 返回格式化字符串，缺失时返回 "N/A"
 */
export function formatBaseCurrencyAmount(
  totalAmountInBaseCurrency: number | null | undefined,
  baseCurrency: string = 'USD',
): string {
  const amount = getBaseCurrencyAmount(totalAmountInBaseCurrency, 0);
  if (amount === null) return 'N/A';
  const symbol = CURRENCY_SYMBOLS[baseCurrency] || baseCurrency;
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 获取币种符号
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}
