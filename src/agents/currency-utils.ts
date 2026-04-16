/**
 * 货币识别与消歧工具
 *
 * 这个模块故意不做任何运行时的跨目录导入（只用 `import type`，运行时被擦除），
 * 方便独立测试脚本通过 `node --experimental-strip-types` 直接运行，
 * 不用配 tsconfig-paths。
 *
 * 代价是要在这里重声明一份 Currency 常量——但 `CurrencyType` 还是从 `../types`
 * 导入（type-only），保证字面量值必须和中央定义一致；任何一端改动都会被 tsc 捕获。
 */

import type { CurrencyType } from '../types';

/** 本地 Currency 常量（运行时使用）。`CurrencyType` 仍由中央 types 模块约束，保证值一致。 */
export const CurrencyConst = {
  CNY: 'CNY' as CurrencyType,
  USD: 'USD' as CurrencyType,
  EUR: 'EUR' as CurrencyType,
  GBP: 'GBP' as CurrencyType,
  JPY: 'JPY' as CurrencyType,
  HKD: 'HKD' as CurrencyType,
  SGD: 'SGD' as CurrencyType,
  AUD: 'AUD' as CurrencyType,
  CAD: 'CAD' as CurrencyType,
  KRW: 'KRW' as CurrencyType,
} as const;

const Currency = CurrencyConst;

export interface CurrencyContext {
  documentCountry?: string;
}

/**
 * 把模型返回的 currency 字段（可能是 ISO 代码、符号、或中文/英文名称）映射为系统支持的货币类型。
 *
 * 注意：这里**不做**与 rawText 的交叉校验——那部分逻辑在 `overrideCurrencyFromRawText` 里，
 * 两者串联使用可以在模型把币种判断错（比如把 USD 识别成 ¥/CNY）时通过 rawText 纠回。
 */
export function mapCurrency(
  currency: string | undefined | null,
  context?: CurrencyContext,
): CurrencyType {
  if (!currency) return Currency.CNY;

  const normalized = currency.trim().toUpperCase();

  const currencyMap: Record<string, CurrencyType> = {
    // 人民币
    CNY: Currency.CNY,
    RMB: Currency.CNY,
    '人民币': Currency.CNY,
    '元': Currency.CNY,

    // 美元（含稳定币 USDC/USDT）
    USD: Currency.USD,
    'US$': Currency.USD,
    'US DOLLAR': Currency.USD,
    'U.S. DOLLAR': Currency.USD,
    '美元': Currency.USD,
    '美金': Currency.USD,
    USDC: Currency.USD,
    USDT: Currency.USD,
    BUSD: Currency.USD,

    // 欧元
    EUR: Currency.EUR,
    '€': Currency.EUR,
    EURO: Currency.EUR,
    '欧元': Currency.EUR,

    // 英镑
    GBP: Currency.GBP,
    '£': Currency.GBP,
    POUND: Currency.GBP,
    '英镑': Currency.GBP,

    // 日元
    JPY: Currency.JPY,
    '日元': Currency.JPY,
    '日圓': Currency.JPY,
    '円': Currency.JPY,
    YEN: Currency.JPY,

    // 港币
    HKD: Currency.HKD,
    'HK$': Currency.HKD,
    'HKD$': Currency.HKD,
    '港币': Currency.HKD,
    '港元': Currency.HKD,
    '港幣': Currency.HKD,

    // 新加坡元
    SGD: Currency.SGD,
    'S$': Currency.SGD,
    'SG$': Currency.SGD,
    'SGD$': Currency.SGD,
    '新币': Currency.SGD,
    '新加坡元': Currency.SGD,
    '新元': Currency.SGD,

    // 澳元
    AUD: Currency.AUD,
    'A$': Currency.AUD,
    'AU$': Currency.AUD,
    'AUD$': Currency.AUD,
    '澳元': Currency.AUD,
    '澳币': Currency.AUD,
    'AUSTRALIAN DOLLAR': Currency.AUD,

    // 加元
    CAD: Currency.CAD,
    'C$': Currency.CAD,
    'CA$': Currency.CAD,
    'CAN$': Currency.CAD,
    'CAD$': Currency.CAD,
    '加元': Currency.CAD,
    '加币': Currency.CAD,
    '加拿大元': Currency.CAD,
    'CANADIAN DOLLAR': Currency.CAD,

    // 韩元
    KRW: Currency.KRW,
    '₩': Currency.KRW,
    '韩元': Currency.KRW,
    '韓元': Currency.KRW,
    WON: Currency.KRW,
    'KOREAN WON': Currency.KRW,
  };

  if (currencyMap[normalized]) {
    return currencyMap[normalized];
  }
  if (currencyMap[currency.trim()]) {
    return currencyMap[currency.trim()];
  }

  // ¥ 符号歧义：优先用 documentCountry 判断；未知时默认 CNY（由 overrideCurrencyFromRawText 兜底纠正）
  if (normalized === '¥' || normalized === '￥') {
    if (context?.documentCountry === 'JP') {
      return Currency.JPY;
    }
    return Currency.CNY;
  }

  // $ 符号歧义
  if (normalized === '$') {
    if (context?.documentCountry === 'CA') return Currency.CAD;
    if (context?.documentCountry === 'AU') return Currency.AUD;
    if (context?.documentCountry === 'SG') return Currency.SGD;
    if (context?.documentCountry === 'HK') return Currency.HKD;
    return Currency.USD;
  }

  console.warn(`[OCR] Unknown currency detected: "${currency}", defaulting to CNY`);
  return Currency.CNY;
}

/**
 * ISO 代码到系统货币类型的映射（只用于 rawText 交叉校验）
 */
const ISO_TO_CURRENCY: Record<string, CurrencyType> = {
  USD: Currency.USD,
  EUR: Currency.EUR,
  GBP: Currency.GBP,
  JPY: Currency.JPY,
  HKD: Currency.HKD,
  SGD: Currency.SGD,
  AUD: Currency.AUD,
  CAD: Currency.CAD,
  KRW: Currency.KRW,
  CNY: Currency.CNY,
  RMB: Currency.CNY,
};

/**
 * 后处理：根据 OCR 返回的 rawText 中是否出现"紧贴金额的 ISO 三字母代码"来纠正币种判断。
 *
 * 背景：视觉模型在看到跨境 SaaS 发票（Anthropic/Stripe/AWS 等美国公司给海外客户开的美金发票，
 * 但账单地址/税号在日本/香港/欧洲）时，容易被地址或 JCT/VAT 等字样误导，把币种判成本地货币。
 * 但这类发票通常在显眼位置印着 "$110.00 USD" 之类的显式 ISO 代码。
 *
 * 只有当 ISO 代码**紧贴金额**（如 "$110.00 USD" / "USD 110" / "110 HKD"）才触发覆盖，
 * 避免把 "USD exchange rate" 之类的散文提及误当成币种信号。
 *
 * 如果 rawText 里出现**多种**紧贴金额的 ISO 代码（例如发票同时标了原币和折算币），
 * 保持模型的原始判断不覆盖，但会打 warning log 方便排查。
 *
 * @returns 纠正后的货币类型（未触发覆盖时原样返回 `mapped`）
 */
export function overrideCurrencyFromRawText(
  mapped: CurrencyType,
  rawText: string | undefined | null,
  rawCurrencyField?: unknown,
): CurrencyType {
  if (!rawText || typeof rawText !== 'string') return mapped;

  // 紧贴金额的 ISO 代码：
  //   "$110.00 USD"、"110 USD"、"¥110 JPY"
  const postAmountRegex =
    /(?:[$€£¥￥₩])?\s*\d[\d,]*(?:\.\d+)?\s*(USD|EUR|GBP|JPY|HKD|SGD|AUD|CAD|KRW|CNY|RMB)\b/gi;
  //   "USD 110"、"USD $110"、"JPY 1,000"
  const preAmountRegex =
    /\b(USD|EUR|GBP|JPY|HKD|SGD|AUD|CAD|KRW|CNY|RMB)\s*(?:[$€£¥￥₩])?\s*\d[\d,]*(?:\.\d+)?/gi;

  const found = new Set<CurrencyType>();
  let m: RegExpExecArray | null;
  while ((m = postAmountRegex.exec(rawText)) !== null) {
    const c = ISO_TO_CURRENCY[m[1].toUpperCase()];
    if (c) found.add(c);
  }
  while ((m = preAmountRegex.exec(rawText)) !== null) {
    const c = ISO_TO_CURRENCY[m[1].toUpperCase()];
    if (c) found.add(c);
  }

  if (found.size === 0) return mapped;

  if (found.size === 1) {
    const [only] = Array.from(found);
    if (mapped !== only) {
      console.warn(
        `[OCR] Currency override: model returned ${JSON.stringify(rawCurrencyField)} ` +
          `(mapped to ${mapped}), but rawText contains explicit "${only}" next to an amount. ` +
          `Overriding to ${only}.`,
      );
    }
    return only;
  }

  console.warn(
    `[OCR] Multiple currencies found in rawText: ${Array.from(found).join(', ')}; ` +
      `keeping model's choice ${mapped}.`,
  );
  return mapped;
}
