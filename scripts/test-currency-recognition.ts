/**
 * 货币识别单元测试（无需测试框架）
 *
 * 运行方式：
 *   node --experimental-strip-types scripts/test-currency-recognition.ts
 *
 * 这个脚本只测 `currency-utils.ts` 里的纯函数，不触发任何真实 OCR 调用，
 * 所以也不需要配置 OpenRouter API key。
 *
 * 这是 Node 22.6+ 原生支持的 TS 剥离模式，不需要额外装 tsx/ts-node。
 * 为了让剥离模式能工作，`currency-utils.ts` 只用了相对导入。
 */

import type { CurrencyType } from '../src/types';
import {
  CurrencyConst as Currency,
  mapCurrency,
  overrideCurrencyFromRawText,
} from '../src/agents/currency-utils.ts';

type TestCase = {
  name: string;
  run: () => CurrencyType;
  expected: CurrencyType;
};

// 为了让测试输出干净，临时静默 console.warn（被测函数在覆盖时会打 warn）
const originalWarn = console.warn;
const collectedWarnings: string[] = [];
console.warn = (...args: unknown[]) => {
  collectedWarnings.push(args.map((a) => String(a)).join(' '));
};

const tests: TestCase[] = [
  // ---------------------------------------------------------------------------
  // 回归测试：原有行为必须保留
  // ---------------------------------------------------------------------------
  {
    name: 'mapCurrency: 显式 "USD" ISO 代码 → USD',
    run: () => mapCurrency('USD'),
    expected: Currency.USD,
  },
  {
    name: 'mapCurrency: 显式 "CNY" ISO 代码 → CNY',
    run: () => mapCurrency('CNY'),
    expected: Currency.CNY,
  },
  {
    name: 'mapCurrency: "人民币" → CNY',
    run: () => mapCurrency('人民币'),
    expected: Currency.CNY,
  },
  {
    name: 'mapCurrency: "美元" → USD',
    run: () => mapCurrency('美元'),
    expected: Currency.USD,
  },
  {
    name: 'mapCurrency: 稳定币 USDC → USD',
    run: () => mapCurrency('USDC'),
    expected: Currency.USD,
  },
  {
    name: 'mapCurrency: C$ → CAD',
    run: () => mapCurrency('C$'),
    expected: Currency.CAD,
  },
  {
    name: 'mapCurrency: HK$ → HKD',
    run: () => mapCurrency('HK$'),
    expected: Currency.HKD,
  },
  {
    name: 'mapCurrency: ¥ + documentCountry=JP → JPY',
    run: () => mapCurrency('¥', { documentCountry: 'JP' }),
    expected: Currency.JPY,
  },
  {
    name: 'mapCurrency: ¥ 无上下文 → CNY (保留默认 fallback)',
    run: () => mapCurrency('¥'),
    expected: Currency.CNY,
  },
  {
    name: 'mapCurrency: $ 无上下文 → USD',
    run: () => mapCurrency('$'),
    expected: Currency.USD,
  },
  {
    name: 'mapCurrency: $ + documentCountry=SG → SGD',
    run: () => mapCurrency('$', { documentCountry: 'SG' }),
    expected: Currency.SGD,
  },
  {
    name: 'mapCurrency: 空字符串 → CNY (保留默认 fallback)',
    run: () => mapCurrency(''),
    expected: Currency.CNY,
  },
  {
    name: 'mapCurrency: null → CNY (保留默认 fallback)',
    run: () => mapCurrency(null),
    expected: Currency.CNY,
  },
  {
    name: 'mapCurrency: 未知 "GALACTIC-CREDIT" → CNY (保留默认 fallback)',
    run: () => mapCurrency('GALACTIC-CREDIT'),
    expected: Currency.CNY,
  },

  // ---------------------------------------------------------------------------
  // 核心 bug 修复：overrideCurrencyFromRawText
  // ---------------------------------------------------------------------------
  {
    name: '[BUG] Anthropic USD 发票：模型输出 ¥/CNY，rawText 含 "$110.00 USD" → 覆盖为 USD',
    run: () => {
      // 真实 bug 现场：发票是 $110 USD，模型看到 Japan JCT 误判成 ¥，映射成 CNY。
      const mapped = mapCurrency('¥'); // → CNY
      return overrideCurrencyFromRawText(
        mapped,
        `Invoice number 6RIJPUMQ-0011 Date of issue April 15, 2026
         VAT Registration Japan JCT: T7700150134388
         $110.00 USD due April 15, 2026
         Max plan - 5x Apr 14–May 14, 2026
         JCT - Japan (10% on $100.00) $10.00
         Total $110.00
         Amount due $110.00 USD`,
        '¥',
      );
    },
    expected: Currency.USD,
  },
  {
    name: '[BUG] 模型输出 "CNY" + rawText 含 "$100 USD" → 覆盖为 USD',
    run: () => {
      const mapped = mapCurrency('CNY'); // → CNY
      return overrideCurrencyFromRawText(
        mapped,
        'Amount due $100.00 USD',
        'CNY',
      );
    },
    expected: Currency.USD,
  },
  {
    name: '[BUG] 模型输出 "JPY" + rawText 含 "110.00 USD" → 覆盖为 USD',
    run: () => {
      const mapped = mapCurrency('JPY'); // → JPY
      return overrideCurrencyFromRawText(
        mapped,
        '$110.00 USD due April 15, 2026',
        'JPY',
      );
    },
    expected: Currency.USD,
  },
  {
    name: 'override: rawText 含 "USD 110" (ISO 在前) → USD',
    run: () =>
      overrideCurrencyFromRawText(
        Currency.CNY,
        'Total: USD 110.00',
        '¥',
      ),
    expected: Currency.USD,
  },
  {
    name: 'override: rawText 含 "HKD 500" → HKD',
    run: () =>
      overrideCurrencyFromRawText(
        Currency.CNY,
        'Subtotal HKD 500.00',
        '$',
      ),
    expected: Currency.HKD,
  },
  {
    name: 'override: rawText 含 "1000 JPY" → JPY',
    run: () =>
      overrideCurrencyFromRawText(
        Currency.CNY,
        '合計 1,000 JPY',
        '¥',
      ),
    expected: Currency.JPY,
  },

  // ---------------------------------------------------------------------------
  // 不该触发覆盖的情况
  // ---------------------------------------------------------------------------
  {
    name: 'override: 纯中文发票，rawText 无 ISO 代码 → 保持 CNY',
    run: () =>
      overrideCurrencyFromRawText(
        Currency.CNY,
        '电子发票（普通发票）  合计金额 ¥1,200.00  开票日期：2026年4月15日',
        '¥',
      ),
    expected: Currency.CNY,
  },
  {
    name: 'override: rawText 提到 "USD exchange rate" 但不紧贴金额 → 不覆盖',
    run: () =>
      overrideCurrencyFromRawText(
        Currency.CNY,
        '电子发票 合计：¥100 (USD exchange rate quoted for reference only)',
        '¥',
      ),
    // 注意：虽然 "USD" 在文本中，但没有紧贴数字，所以不触发覆盖。
    // 实际 rawText 里 "USD exchange rate quoted" 的 USD 后面是 " exchange"，
    // 不是数字，也不是符号；前面是 "(", 也没数字紧贴。
    expected: Currency.CNY,
  },
  {
    name: 'override: rawText 同时含 USD 和 CNY（原币+折算币）→ 不覆盖，保持模型判断',
    run: () =>
      overrideCurrencyFromRawText(
        Currency.USD,
        'Amount: $100 USD (equivalent to CNY 700)',
        'USD',
      ),
    expected: Currency.USD,
  },
  {
    name: 'override: rawText 为空字符串 → 原样返回',
    run: () => overrideCurrencyFromRawText(Currency.CNY, '', '¥'),
    expected: Currency.CNY,
  },
  {
    name: 'override: rawText 为 undefined → 原样返回',
    run: () => overrideCurrencyFromRawText(Currency.CNY, undefined, '¥'),
    expected: Currency.CNY,
  },

  // ---------------------------------------------------------------------------
  // 端到端：模拟 parseOCRResponse 里的两步组合
  // ---------------------------------------------------------------------------
  {
    name: 'E2E: Anthropic USD 发票 + 模型 currency=null + documentCountry=JP → USD',
    run: () => {
      // 即使模型把 documentCountry 推成 JP、currency 忘了填，
      // rawText 里的 "$110.00 USD" 也会把币种纠回 USD。
      const mapped = mapCurrency(null, { documentCountry: 'JP' });
      return overrideCurrencyFromRawText(
        mapped,
        '$110.00 USD due April 15, 2026',
        null,
      );
    },
    expected: Currency.USD,
  },
  {
    name: 'E2E: 日本法人 JCT 发票（真·日元）+ 模型 currency=¥ + rawText "10,000 JPY" → JPY',
    run: () => {
      // 这是真正的日元场景：不管 documentCountry 有没有给出来，
      // rawText 里的 "JPY" 能把币种钉死。
      const mapped = mapCurrency('¥', { documentCountry: 'JP' });
      return overrideCurrencyFromRawText(
        mapped,
        '合計 10,000 JPY 消費税 10%',
        '¥',
      );
    },
    expected: Currency.JPY,
  },
  {
    name: 'E2E: 香港收据 HK$ + rawText 无 ISO → 走符号 → HKD',
    run: () => {
      const mapped = mapCurrency('HK$');
      return overrideCurrencyFromRawText(
        mapped,
        '收據 HK$ 500.00 多謝惠顧',
        'HK$',
      );
    },
    expected: Currency.HKD,
  },
];

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const test of tests) {
  let actual: CurrencyType | undefined;
  let error: unknown;
  try {
    actual = test.run();
  } catch (e) {
    error = e;
  }

  const ok = actual === test.expected;
  if (ok) {
    passed++;
    originalWarn(`  PASS  ${test.name}`);
  } else {
    failed++;
    const msg = error
      ? `  FAIL  ${test.name}\n        threw: ${(error as Error).message}`
      : `  FAIL  ${test.name}\n        expected=${test.expected}, got=${actual}`;
    failures.push(msg);
    originalWarn(msg);
  }
}

// 恢复 warn 以输出摘要
console.warn = originalWarn;

console.log('\n' + '='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
if (collectedWarnings.length > 0) {
  console.log(`\nSuppressed ${collectedWarnings.length} warning(s) from override logic:`);
  for (const w of collectedWarnings) {
    console.log(`  - ${w}`);
  }
}

if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(f);
  process.exit(1);
}

console.log('\nAll currency recognition tests passed.');
