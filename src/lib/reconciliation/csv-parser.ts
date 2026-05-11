/**
 * Fluxa 转账清单 CSV 解析器
 *
 * 假设字段（缺一个就标 missing，不会硬错）：
 *   必有：txHash, amount, token, fromAddress, toAddress, timestamp
 *   可选：status, gasFee, payoutId / transferId, chainId, network
 *
 * 字段名做了大小写 / 下划线 / 连字符容错（fromAddress / from_address / from-address 都吃）。
 * 实在认不出的列放进 raw_extra，jsonb 存原样，便于后续扩展。
 */

export interface FluxaCsvRow {
  txHash: string;
  amount: number;
  token: string;
  fromAddress: string;
  toAddress: string;
  timestamp: string; // ISO
  status?: string;   // success / failed / pending
  gasFee?: number;
  payoutId?: string;
  chainId?: string;
  network?: string;
  /** 解析时遇到不认识的列原样塞进来 */
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
  txHash:      ['txhash', 'tx_hash', 'transaction_hash', 'hash'],
  amount:      ['amount', 'value'],
  token:       ['token', 'currency', 'asset', 'symbol'],
  fromAddress: ['fromaddress', 'from_address', 'from'],
  toAddress:   ['toaddress', 'to_address', 'to', 'recipient'],
  timestamp:   ['timestamp', 'time', 'date', 'created_at', 'block_time'],
  status:      ['status', 'state'],
  gasFee:      ['gasfee', 'gas_fee', 'fee', 'gas'],
  payoutId:    ['payoutid', 'payout_id', 'transferid', 'transfer_id', 'mandateid', 'mandate_id', 'id'],
  chainId:     ['chainid', 'chain_id'],
  network:     ['network', 'chain'],
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

  // 必填字段缺一报警，但仍试着解析（允许 partial）
  const required: (keyof FluxaCsvRow)[] = ['txHash', 'amount', 'toAddress', 'timestamp'];
  const presentFields = new Set(Array.from(headerMap.values()).filter(Boolean) as string[]);
  for (const r of required) {
    if (!presentFields.has(r)) warnings.push(`CSV 缺少必填字段：${r}`);
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

    // 必填字段缺失 → 这一行进 errors，跳过
    if (!row.txHash || row.amount === undefined || !row.toAddress || !row.timestamp) {
      errors.push({
        line: li + 1,
        reason: `必填字段缺失（txHash=${!!row.txHash}, amount=${row.amount !== undefined}, toAddress=${!!row.toAddress}, timestamp=${!!row.timestamp}）`,
      });
      continue;
    }

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
