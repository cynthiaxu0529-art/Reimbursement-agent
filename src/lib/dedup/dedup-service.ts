/**
 * 报销去重检测服务
 * 提供跨报销单去重、发票号码去重、凭证 URL 复用检测
 */

import { db } from '@/lib/db';
import { reimbursements, reimbursementItems } from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

// 去重检查结果
export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  warnings: DuplicateWarning[];
}

export interface DuplicateWarning {
  type: 'cross_reimbursement' | 'invoice_number' | 'receipt_url';
  severity: 'error' | 'warning';  // error = 硬拦截, warning = 提示但允许继续
  itemIndex: number;
  message: string;
  existingReimbursementId?: string;
  existingItemId?: string;
}

/**
 * 综合去重检查 - 在创建报销单时调用
 * 检查三类重复：跨报销单费用重复、发票号码重复、凭证 URL 复用
 */
export async function checkDuplicates(
  userId: string,
  tenantId: string,
  items: Array<{
    category: string;
    amount: number;
    date: string;
    invoiceNumber?: string;
    receiptUrl?: string;
    description?: string;
  }>
): Promise<DuplicateCheckResult> {
  const warnings: DuplicateWarning[] = [];

  // 并行执行三项检查
  const [crossDupWarnings, invoiceDupWarnings, receiptDupWarnings] = await Promise.all([
    checkCrossReimbursementDuplicates(userId, tenantId, items),
    checkInvoiceNumberDuplicates(tenantId, items),
    checkReceiptUrlDuplicates(tenantId, items),
  ]);

  warnings.push(...crossDupWarnings, ...invoiceDupWarnings, ...receiptDupWarnings);

  return {
    hasDuplicates: warnings.length > 0,
    warnings,
  };
}

/**
 * 跨报销单去重：检查同用户历史报销中是否有相同 category+amount+date 的费用项
 */
async function checkCrossReimbursementDuplicates(
  userId: string,
  tenantId: string,
  items: Array<{ category: string; amount: number; date: string; description?: string }>
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];

  // 查询该用户所有非 rejected 状态的报销单
  const userReimbursements = await db
    .select({ id: reimbursements.id, title: reimbursements.title, status: reimbursements.status })
    .from(reimbursements)
    .where(and(
      eq(reimbursements.userId, userId),
      eq(reimbursements.tenantId, tenantId),
      sql`${reimbursements.status} NOT IN ('rejected')`
    ));

  if (userReimbursements.length === 0) return warnings;

  const reimbursementIds = userReimbursements.map(r => r.id);

  // 查询所有历史费用明细
  const existingItems = await db
    .select({
      id: reimbursementItems.id,
      reimbursementId: reimbursementItems.reimbursementId,
      category: reimbursementItems.category,
      amount: reimbursementItems.amount,
      date: reimbursementItems.date,
      description: reimbursementItems.description,
    })
    .from(reimbursementItems)
    .where(inArray(reimbursementItems.reimbursementId, reimbursementIds));

  // 构建历史费用的 fingerprint 索引
  const existingFingerprints = new Map<string, { id: string; reimbursementId: string; description: string }>();
  for (const existing of existingItems) {
    const dateStr = existing.date instanceof Date
      ? existing.date.toISOString().split('T')[0]
      : String(existing.date).split('T')[0];
    // 金额四舍五入到2位小数避免浮点精度问题
    const key = `${existing.category}_${Math.round(existing.amount * 100)}_${dateStr}`;
    existingFingerprints.set(key, {
      id: existing.id,
      reimbursementId: existing.reimbursementId,
      description: existing.description,
    });
  }

  // 比对新提交的每一项
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const dateStr = item.date?.split?.('T')[0] || item.date;
    const key = `${item.category}_${Math.round(item.amount * 100)}_${dateStr}`;
    const match = existingFingerprints.get(key);

    if (match) {
      const reimbTitle = userReimbursements.find(r => r.id === match.reimbursementId)?.title || '';
      warnings.push({
        type: 'cross_reimbursement',
        severity: 'warning',
        itemIndex: i,
        message: `第 ${i + 1} 项（${item.category}: ${item.amount} @ ${dateStr}）与已有报销单「${reimbTitle}」中的「${match.description}」疑似重复（类别+金额+日期相同）`,
        existingReimbursementId: match.reimbursementId,
        existingItemId: match.id,
      });
    }
  }

  return warnings;
}

/**
 * 发票号码去重：检查同一租户下是否有相同发票号码的费用项
 */
async function checkInvoiceNumberDuplicates(
  tenantId: string,
  items: Array<{ invoiceNumber?: string }>
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];

  // 收集所有非空的发票号码
  const invoiceNumbers = items
    .map((item, idx) => ({ invoiceNumber: item.invoiceNumber, idx }))
    .filter(x => x.invoiceNumber && x.invoiceNumber.trim() !== '');

  if (invoiceNumbers.length === 0) return warnings;

  const numbers = invoiceNumbers.map(x => x.invoiceNumber!.trim());

  // 查询该租户下所有报销单中的费用项（按发票号码匹配）
  const existingItems = await db
    .select({
      id: reimbursementItems.id,
      reimbursementId: reimbursementItems.reimbursementId,
      invoiceNumber: reimbursementItems.invoiceNumber,
      description: reimbursementItems.description,
    })
    .from(reimbursementItems)
    .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
    .where(and(
      eq(reimbursements.tenantId, tenantId),
      inArray(reimbursementItems.invoiceNumber, numbers),
      sql`${reimbursements.status} NOT IN ('rejected')`
    ));

  // 构建已有发票号码索引
  const existingInvoiceMap = new Map<string, { id: string; reimbursementId: string; description: string }>();
  for (const item of existingItems) {
    if (item.invoiceNumber) {
      existingInvoiceMap.set(item.invoiceNumber, {
        id: item.id,
        reimbursementId: item.reimbursementId,
        description: item.description,
      });
    }
  }

  // 检查每个新发票号码
  for (const { invoiceNumber, idx } of invoiceNumbers) {
    const match = existingInvoiceMap.get(invoiceNumber!.trim());
    if (match) {
      warnings.push({
        type: 'invoice_number',
        severity: 'error',
        itemIndex: idx,
        message: `第 ${idx + 1} 项的发票号码「${invoiceNumber}」已在其他报销单中使用（关联费用项：${match.description}），请勿重复报销`,
        existingReimbursementId: match.reimbursementId,
        existingItemId: match.id,
      });
    }
  }

  // 同一提交内的发票号码也不能重复
  const seen = new Map<string, number>();
  for (const { invoiceNumber, idx } of invoiceNumbers) {
    const num = invoiceNumber!.trim();
    if (seen.has(num)) {
      warnings.push({
        type: 'invoice_number',
        severity: 'error',
        itemIndex: idx,
        message: `第 ${idx + 1} 项与第 ${seen.get(num)! + 1} 项使用了相同的发票号码「${num}」`,
      });
    } else {
      seen.set(num, idx);
    }
  }

  return warnings;
}

/**
 * 凭证 URL 复用检测：同一 receiptUrl 不能在已有费用项中重复使用
 */
async function checkReceiptUrlDuplicates(
  tenantId: string,
  items: Array<{ receiptUrl?: string }>
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];

  // 收集所有非空的 receiptUrl
  const receiptUrls = items
    .map((item, idx) => ({ url: item.receiptUrl, idx }))
    .filter(x => x.url && x.url.trim() !== '');

  if (receiptUrls.length === 0) return warnings;

  const urls = receiptUrls.map(x => x.url!.trim());

  // 查询该租户下已存在的相同 receiptUrl
  const existingItems = await db
    .select({
      id: reimbursementItems.id,
      reimbursementId: reimbursementItems.reimbursementId,
      receiptUrl: reimbursementItems.receiptUrl,
      description: reimbursementItems.description,
    })
    .from(reimbursementItems)
    .innerJoin(reimbursements, eq(reimbursementItems.reimbursementId, reimbursements.id))
    .where(and(
      eq(reimbursements.tenantId, tenantId),
      inArray(reimbursementItems.receiptUrl, urls),
      sql`${reimbursements.status} NOT IN ('rejected')`
    ));

  // 构建已有 URL 索引
  const existingUrlMap = new Map<string, { id: string; reimbursementId: string; description: string }>();
  for (const item of existingItems) {
    if (item.receiptUrl) {
      existingUrlMap.set(item.receiptUrl, {
        id: item.id,
        reimbursementId: item.reimbursementId,
        description: item.description,
      });
    }
  }

  // 检查每个新 URL
  for (const { url, idx } of receiptUrls) {
    const match = existingUrlMap.get(url!.trim());
    if (match) {
      warnings.push({
        type: 'receipt_url',
        severity: 'warning',
        itemIndex: idx,
        message: `第 ${idx + 1} 项的凭证图片已在其他报销单中使用（关联：${match.description}），请确认是否误用了相同凭证`,
        existingReimbursementId: match.reimbursementId,
        existingItemId: match.id,
      });
    }
  }

  // 同一提交内的凭证 URL 也不应重复（除非是同一张发票拆分的多个费用项）
  const seen = new Map<string, number>();
  for (const { url, idx } of receiptUrls) {
    const u = url!.trim();
    if (seen.has(u)) {
      warnings.push({
        type: 'receipt_url',
        severity: 'warning',
        itemIndex: idx,
        message: `第 ${idx + 1} 项与第 ${seen.get(u)! + 1} 项使用了相同的凭证图片，请确认是否正确`,
      });
    } else {
      seen.set(u, idx);
    }
  }

  return warnings;
}
