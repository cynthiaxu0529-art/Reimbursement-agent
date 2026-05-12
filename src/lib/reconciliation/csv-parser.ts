/**
 * Fluxa 转账清单 CSV 解析器
 *
 * 兼容两种 Fluxa 导出格式：
 *
 *   1. Mandate Bills（早期格式，2026-Q1）
 *      #, Mandate ID, Date, Description, Payee Wallet Address, Payee FluxA Account, Payee Agent ID, Amount
 *
 *   2. Wallet Activity（2026-Q2 起，更丰富）
 *      ts_utc, biz_type, direction, network, currency, amount_raw, amount_usd, our_address,
 *      counterparty, agent_id, agent_external_id, mandate_id, approval_id, tx_hash, status,
 *      biz_ref, description
 *
 * 必填：amount + toAddress + timestamp + (txHash 或 payoutId 至少一个)。
 * 其它字段可选；不认识的列原样塞进 rawExtra（jsonb），便于后续扩展。
 *
 * 行过滤规则：
 *   - direction='in' → 跳过（入金不是 payout）
 *   - status ∉ {success, succeeded, confirmed, ok, 1} → 跳过 + warning
 *
 * 注意：旧 Mandate Bills 格式无 txHash 列，匹配主要靠 Mandate ID（payoutId）；
 *      新 Wallet Activity 格式 tx_hash + biz_ref 都有，一二级匹配都能用。
 */

export interface FluxaCsvRow {
  /** 链上交易哈希。旧 Mandate Bills 格式没这一列，缺失时为 ''  */
  txHash: string;
  amount: number;
  token: string;
  fromAddress: string;
  toAddress: string;
  timestamp: string; // ISO
  status?: string;   // success / failed / pending
  gasFee?: number;
  /** Fluxa Mandate ID / 转账唯一 ID / 我们的 biz_ref —— 主匹配键 */
  payoutId?: string;
  chainId?: string;
  network?: string;
  /** payout / trial_bonus / refund 等 —— Wallet Activity 格式独有 */
  bizType?: string;
  /** out / in —— Wallet Activity 格式独有，'in' 行会被过滤掉 */
  direction?: string;
  /** 解析时遇到不认识的列原样塞进来（包括 Description / FluxA Account / Agent ID 等） */
  rawExtra?: Record<string, string>;
  /** 这一行原始 CSV 内容（debug 用） */
  rawLine?: string;
}

export interface CsvParseResult {
  rows: FluxaCsvRow[];
  warnings: string[];
  /** 解析失败的行号（1-based, 含 header）+ 原因 */
  errors: { line: number; reason: string }[];
}

const FIELD_ALIASES: Record<keyof FluxaCsvRow, string[]> = {
  // alias 已经经过 normalize（去 _ / - / 空格、转小写）后比对
  txHash:      ['txhash', 'transactionhash', 'hash'],
  // amountusd 优先级和 amount 同等；如果 Wallet Activity 同时有 amount_raw + amount_usd，
  // 用户应该看 amount_usd（已经按币种 normalized 到 USD）
  amount:      ['amount', 'value', 'amountusd'],
  token:       ['token', 'currency', 'asset', 'symbol'],
  fromAddress: ['fromaddress', 'from', 'payerwalletaddress', 'ouraddress'],
  toAddress:   ['toaddress', 'to', 'recipient', 'payeewalletaddress', 'payeeaddress', 'counterparty'],
  timestamp:   ['timestamp', 'time', 'date', 'createdat', 'blocktime', 'tsutc'],
  status:      ['status', 'state'],
  gasFee:      ['gasfee', 'fee', 'gas'],
  payoutId:    ['payoutid', 'transferid', 'mandateid', 'id', 'bizref'],
  chainId:     ['chainid'],
  network:     ['network', 'chain'],
  bizType:     ['biztype', 'transactiontype'],
  direction:   ['direction', 'flow', 'inout'],
  rawExtra:    [],
  rawLine:     [],
};

/** 把 header 名归一化：去空白、转小写、去掉 -/_ */
function normalize(header: string): string {
  return header.trim().toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * 简易 CSV 行解析 —— 支持双引号包裹、双引号转义。
 * 故意不引第三方依赖（package.json 还没 csv-parse），保持轻量。
 */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseFluxaCsv(content: string): CsvParseResult {
  const warnings: string[] = [];
  const errors: { line: number; reason: string }[] = [];
  const rows: FluxaCsvRow[] = [];

  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows, warnings, errors: [{ line: 1, reason: 'CSV 至少需要 header + 1 行数据' }] };
  }

  const headerCells = parseLine(lines[0]).map(normalize);

  // 建立 header → 我们认识的字段名 的映射
  const headerMap = new Map<number, keyof FluxaCsvRow | null>();
  const unknownHeaders: { idx: number; raw: string }[] = [];

  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i];
    let matched: keyof FluxaCsvRow | null = null;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof FluxaCsvRow, string[]][]) {
      if (aliases.includes(h)) {
        matched = field;
        break;
      }
    }
    headerMap.set(i, matched);
    if (!matched) unknownHeaders.push({ idx: i, raw: parseLine(lines[0])[i] });
  }

  // 必填字段：amount + toAddress + timestamp + (txHash 或 payoutId 任一)
  // Fluxa 当前导出无 txHash，必须靠 Mandate ID（=payoutId）匹配
  const required: (keyof FluxaCsvRow)[] = ['amount', 'toAddress', 'timestamp'];
  const presentFields = new Set(Array.from(headerMap.values()).filter(Boolean) as string[]);
  for (const r of required) {
    if (!presentFields.has(r)) warnings.push(`CSV 缺少必填字段：${r}`);
  }
  if (!presentFields.has('txHash') && !presentFields.has('payoutId')) {
    warnings.push('CSV 同时缺失 txHash 和 payoutId，将只能依赖 (地址+金额+时间) 模糊匹配');
  }

  for (let li = 1; li < lines.length; li++) {
    const cells = parseLine(lines[li]);
    if (cells.length === 0) continue;

    const row: Partial<FluxaCsvRow> & { rawExtra: Record<string, string> } = {
      rawExtra: {},
      rawLine: lines[li],
    };

    for (let ci = 0; ci < cells.length; ci++) {
      const field = headerMap.get(ci);
      const raw = cells[ci];
      if (!field) {
        const headerRaw = parseLine(lines[0])[ci];
        if (headerRaw) row.rawExtra[headerRaw] = raw;
        continue;
      }
      if (field === 'amount' || field === 'gasFee') {
        const num = Number(raw);
        if (Number.isFinite(num)) (row as any)[field] = num;
      } else if (field === 'rawExtra' || field === 'rawLine') {
        // skip — handled above
      } else {
        (row as any)[field] = raw;
      }
    }

    // Wallet Activity 格式：direction='in' 是入金（trial_bonus / refund），不是 payout，跳过
    if (row.direction && row.direction.trim().toLowerCase() === 'in') {
      warnings.push(`第 ${li + 1} 行 direction=in（${row.bizType || '入金'}），跳过`);
      continue;
    }

    // 必填字段缺失 → 这一行进 errors，跳过
    // txHash 或 payoutId 任一必须有，否则没法做精确匹配
    const hasMatchKey = !!row.txHash || !!row.payoutId;
    if (row.amount === undefined || !row.toAddress || !row.timestamp || !hasMatchKey) {
      errors.push({
        line: li + 1,
        reason: `必填字段缺失（amount=${row.amount !== undefined}, toAddress=${!!row.toAddress}, timestamp=${!!row.timestamp}, matchKey(txHash|payoutId)=${hasMatchKey}）`,
      });
      continue;
    }

    // txHash 字段在 FluxaCsvRow 上是 string，但旧 Mandate Bills 格式没这列。
    // 给它一个空字符串占位，让下游 norm() 自然返回 ''，匹配阶段会跳过。
    if (!row.txHash) row.txHash = '';

    // status 字段如果有，过滤掉非 success
    if (row.status && !isSuccessStatus(row.status)) {
      warnings.push(`第 ${li + 1} 行 status="${row.status}"，跳过（非成功 tx）`);
      continue;
    }

    rows.push(row as FluxaCsvRow);
  }

  return { rows, warnings, errors };
}

function isSuccessStatus(s: string): boolean {
  const lower = s.trim().toLowerCase();
  return lower === 'success' || lower === 'succeeded' || lower === 'confirmed' || lower === 'ok' || lower === '1';
}

/**
 * 从 CSV 行集合推断覆盖的时间范围
 */
export function inferPeriod(rows: FluxaCsvRow[]): { periodStart?: Date; periodEnd?: Date } {
  if (rows.length === 0) return {};
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const t = new Date(r.timestamp).getTime();
    if (!Number.isNaN(t)) {
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }
  if (min === Infinity || max === -Infinity) return {};
  return { periodStart: new Date(min), periodEnd: new Date(max) };
}
