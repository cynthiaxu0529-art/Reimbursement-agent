import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, users, tenants, tripItineraries, tripItineraryItems } from '@/lib/db/schema';
import { eq, desc, and, or, inArray, sql } from 'drizzle-orm';
import { getUserRoles, canApprove, canProcessPayment, isAdmin } from '@/lib/auth/roles';
import { getVisibleUserIds } from '@/lib/department/department-service';
import { checkItemsLimit } from '@/lib/policy/limit-service';
import { checkDuplicates } from '@/lib/dedup/dedup-service';
import { authenticate, logAgentAction, type AuthContext } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { createChatCompletion, extractTextContent } from '@/lib/ai/openrouter-client';
import { apiError } from '@/lib/api-error';
import { getIdempotencyKey, getCachedResponse, cacheResponse } from '@/lib/idempotency';
import { exchangeRateService, loadMonthlyRatesFromDB } from '@/lib/currency/exchange-service';
import type { CurrencyType } from '@/types';

// 强制动态渲染，避免构建时预渲染
export const dynamic = 'force-dynamic';

/** 向响应注入 Rate Limit header（如果有） */
function withRateHeaders(response: NextResponse, authCtx: AuthContext): NextResponse {
  if (authCtx.rateLimit) {
    response.headers.set('X-RateLimit-Limit', String(authCtx.rateLimit.limit));
    response.headers.set('X-RateLimit-Remaining', String(authCtx.rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(authCtx.rateLimit.resetAt));
  }
  return response;
}

/**
 * GET /api/reimbursements - 获取报销列表
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function GET(request: NextRequest) {
  try {
    // 统一认证（自动判断 Session 或 API Key）
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_READ);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;
    const startTime = Date.now();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const role = searchParams.get('role'); // 'approver' 查看待审批的
    const myApprovals = searchParams.get('myApprovals') === 'true'; // 只看自己批准的
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // 获取用户实际的数据库角色
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, authCtx.userId),
    });

    if (!currentUser) {
      return apiError('用户不存在', 404);
    }

    // 获取用户的角色数组（支持多角色）
    const userRoles = getUserRoles(currentUser);

    // 构建查询条件
    const conditions: any[] = [];

    // 验证角色权限并应用部门级数据隔离
    if (role === 'approver' && currentUser.tenantId) {
      // 检查用户是否有审批权限（admin也可以查看和审批）
      if (!canApprove(userRoles) && !isAdmin(userRoles)) {
        return apiError('无审批权限', 403, 'ROLE_INSUFFICIENT');
      }

      // 获取用户可以查看的报销提交人ID列表（部门级数据隔离）
      const visibleUserIds = await getVisibleUserIds(
        authCtx.userId,
        currentUser.tenantId,
        userRoles
      );

      if (visibleUserIds === null) {
        // Finance/Admin/Super Admin 可以看同租户所有报销
        conditions.push(eq(reimbursements.tenantId, currentUser.tenantId));
      } else if (visibleUserIds.length > 0) {
        // Manager 只能看管理部门（含子部门）的成员报销
        conditions.push(eq(reimbursements.tenantId, currentUser.tenantId));
        conditions.push(inArray(reimbursements.userId, visibleUserIds));
      } else {
        // 没有管理任何部门，只能看自己的
        conditions.push(eq(reimbursements.userId, authCtx.userId));
      }

      // 如果只看自己处理的（批准或驳回）
      if (myApprovals) {
        conditions.push(or(
          eq(reimbursements.approvedBy, authCtx.userId),
          eq(reimbursements.rejectedBy, authCtx.userId)
        ));
      }
    } else if (role === 'finance' && currentUser.tenantId) {
      // 检查用户是否有财务权限
      if (!canProcessPayment(userRoles)) {
        return apiError('无财务权限', 403, 'ROLE_INSUFFICIENT');
      }
      // 财务可以看同租户所有报销（需要处理付款）
      conditions.push(eq(reimbursements.tenantId, currentUser.tenantId));
    } else {
      // 员工模式：只看自己的
      conditions.push(eq(reimbursements.userId, authCtx.userId));
    }

    // 支持多个状态（逗号分隔）
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        conditions.push(eq(reimbursements.status, statuses[0] as any));
      } else {
        // 多个状态用 inArray
        const { inArray } = await import('drizzle-orm');
        conditions.push(inArray(reimbursements.status, statuses as any[]));
      }
    }

    // 是否需要加载提交人信息（审批人、财务、管理员查看他人报销时需要）
    const isApproverOrFinance = (role === 'approver' && (canApprove(userRoles) || isAdmin(userRoles))) ||
                                 (role === 'finance' && canProcessPayment(userRoles));

    // 并行查询：报销列表 + 总数
    const whereClause = and(...conditions);

    const [list, countResult] = await Promise.all([
      db.query.reimbursements.findMany({
        where: whereClause,
        orderBy: [desc(reimbursements.createdAt)],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        with: {
          items: true,
          user: isApproverOrFinance ? {
            columns: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              department: true,
            },
          } : undefined,
        },
      }),
      db.select({ count: sql<number>`count(*)::int` })
        .from(reimbursements)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    // Transform data to include submitter info for approver mode
    const transformedList = list.map((item: any) => ({
      ...item,
      submitter: item.user ? {
        name: item.user.name,
        email: item.user.email,
        avatar: item.user.avatar,
        department: item.user.department,
      } : undefined,
      user: undefined, // Remove the raw user object
    }));

    const response = {
      success: true,
      data: transformedList,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };

    // Agent 审计日志
    if (authCtx.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: authCtx.tenantId!,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'reimbursement:read',
        method: 'GET',
        path: '/api/reimbursements',
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: { status, role, page, pageSize },
        responseSummary: { count: transformedList.length },
        entityType: 'reimbursement',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        durationMs: Date.now() - startTime,
      });
    }

    return withRateHeaders(NextResponse.json(response), authCtx);
  } catch (error) {
    console.error('Get reimbursements error:', error);
    return apiError('获取报销列表失败', 500);
  }
}

/**
 * POST /api/reimbursements - 创建报销单
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 */
export async function POST(request: NextRequest) {
  try {
    // 幂等性检查：如果有 Idempotency-Key 且已缓存，直接返回
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const cached = getCachedResponse(idempotencyKey);
      if (cached) return cached;
    }

    // 统一认证
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_CREATE);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;
    const startTime = Date.now();

    const body = await request.json();
    const { title, description, tripId, items, status: submitStatus, totalAmountInBaseCurrency } = body;

    if (!title || !items || items.length === 0) {
      return apiError('请填写标题和至少一项费用', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // 检查用户是否有公司
    const tenantId = authCtx.tenantId;
    if (!tenantId) {
      return apiError('请先在设置中创建或加入公司，才能提交报销', 400, 'NO_TENANT');
    }

    // Agent 金额限制检查（使用本位币金额，与限额币种一致）
    if (authCtx.authType === 'api_key' && authCtx.apiKey?.limits.maxAmountPerRequest) {
      const requestTotal = items.reduce(
        (sum: number, item: any) => sum + (parseFloat(item.amountInBaseCurrency) || parseFloat(item.amount) || 0), 0
      );
      if (requestTotal > authCtx.apiKey.limits.maxAmountPerRequest) {
        return apiError(
          `Agent 单次报销金额超过限制（上限: $${authCtx.apiKey.limits.maxAmountPerRequest}，本次: $${requestTotal.toFixed(2)}）`,
          403,
          'AMOUNT_LIMIT_EXCEEDED',
        );
      }
    }

    // Agent 创建报销时，如果要直接提交（status=pending），需要额外的 submit scope
    if (authCtx.authType === 'api_key' && submitStatus === 'pending') {
      const hasSubmitScope = authCtx.apiKey?.scopes.includes(API_SCOPES.REIMBURSEMENT_SUBMIT);
      if (!hasSubmitScope) {
        return apiError('Agent 缺少 reimbursement:submit scope，只能创建草稿', 403, 'INSUFFICIENT_SCOPE');
      }
    }

    // 获取租户本位币
    const tenantRecord = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { baseCurrency: true },
    });
    const tenantBaseCurrency = tenantRecord?.baseCurrency || 'USD';

    // 验证每项费用的必填字段
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.category) {
        return apiError(`第 ${i + 1} 项费用缺少类别`, 400, 'MISSING_REQUIRED_FIELDS');
      }
      if (!item.amount || isNaN(parseFloat(item.amount))) {
        return apiError(`第 ${i + 1} 项费用金额无效`, 400, 'INVALID_AMOUNT');
      }
      if (!item.date) {
        return apiError(`第 ${i + 1} 项费用缺少日期`, 400, 'MISSING_REQUIRED_FIELDS');
      }
    }

    // 从数据库加载当月管理员设定的汇率，确保与公司汇率表一致
    await loadMonthlyRatesFromDB();

    // 服务端汇率转换：如果 item 缺少 exchangeRate / amountInBaseCurrency，自动转换
    // 保证 Agent 提交和手动提交行为一致（前端在客户端做转换，Agent 由服务端补齐）
    for (const item of items) {
      const itemCurrency = (item.currency || 'CNY') as CurrencyType;
      const itemAmount = parseFloat(item.amount) || 0;

      // 如果币种和本位币相同，无需转换
      if (itemCurrency === tenantBaseCurrency) {
        item.exchangeRate = item.exchangeRate || 1;
        item.amountInBaseCurrency = item.amountInBaseCurrency || itemAmount;
        continue;
      }

      // 如果前端/Agent 已经提供了有效的 exchangeRate 和 amountInBaseCurrency，直接使用
      if (item.exchangeRate && item.amountInBaseCurrency && item.amountInBaseCurrency !== itemAmount) {
        continue;
      }

      // 否则使用服务端汇率自动转换
      try {
        const conversion = await exchangeRateService.convert({
          amount: itemAmount,
          fromCurrency: itemCurrency,
          toCurrency: tenantBaseCurrency as CurrencyType,
        });
        item.exchangeRate = conversion.exchangeRate;
        item.amountInBaseCurrency = conversion.convertedAmount;
      } catch (err) {
        console.warn(`Exchange rate conversion failed for ${itemCurrency} → ${tenantBaseCurrency}:`, err);
        // 转换失败时不要用原始金额当本位币金额，这会导致 CNY 金额被当作 USD 比对限额
        // 而是标记为未转换，后续安全网会处理
        item._conversionFailed = true;
      }
    }

    // 安全网：强制校验所有非本位币的 item 已正确转换
    // 防止 CNY 金额被当作 USD 来比对限额（最常见的 bug）
    for (const item of items) {
      const itemCurrency = (item.currency || 'CNY') as CurrencyType;
      const itemAmount = parseFloat(item.amount) || 0;

      if (itemCurrency === tenantBaseCurrency || itemAmount === 0) continue;

      const baseCurrencyAmount = parseFloat(item.amountInBaseCurrency) || 0;

      // 检测未转换的情况：币种不同但 amountInBaseCurrency ≈ amount（说明没有真正转换）
      const notConverted = item._conversionFailed ||
        baseCurrencyAmount === 0 ||
        (baseCurrencyAmount > 0 && Math.abs(baseCurrencyAmount - itemAmount) / itemAmount < 0.01);

      if (notConverted) {
        console.warn(`[CurrencyFix] ${itemCurrency} ${itemAmount} was not properly converted to ${tenantBaseCurrency} (amountInBaseCurrency=${baseCurrencyAmount}), forcing re-conversion`);
        try {
          const conversion = await exchangeRateService.convert({
            amount: itemAmount,
            fromCurrency: itemCurrency,
            toCurrency: tenantBaseCurrency as CurrencyType,
          });
          item.exchangeRate = conversion.exchangeRate;
          item.amountInBaseCurrency = conversion.convertedAmount;
          console.log(`[CurrencyFix] Successfully re-converted: ${itemCurrency} ${itemAmount} → ${tenantBaseCurrency} ${conversion.convertedAmount} (rate: ${conversion.exchangeRate})`);
        } catch (retryErr) {
          // 最终兜底：用硬编码汇率估算，绝不能让原币金额直接当本位币
          console.error(`[CurrencyFix] Re-conversion also failed, using hardcoded fallback`, retryErr);
          const fallbackRates: Record<string, number> = { CNY: 0.138, EUR: 1.08, GBP: 1.27, JPY: 0.0067, HKD: 0.128, SGD: 0.74, AUD: 0.65, CAD: 0.73, KRW: 0.00073 };
          const fallbackRate = fallbackRates[itemCurrency] || 0.15;
          item.exchangeRate = fallbackRate;
          item.amountInBaseCurrency = Math.round(itemAmount * fallbackRate * 100) / 100;
        }
      }
    }

    // 安全网 2：检测 Agent 错误地将 CNY 金额标为 USD 提交
    // 常见表现：currency=USD, exchangeRate=1, vendor 含中文字符 → 实际应该是 CNY
    // 检测逻辑：如果 currency == 本位币 且 exchangeRate ≈ 1 且 vendor/description 含中文/日文/韩文
    const hasCJKPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
    for (const item of items) {
      const itemCurrency = (item.currency || '') as string;
      const itemAmount = parseFloat(item.amount) || 0;
      const rate = parseFloat(item.exchangeRate) || 0;

      // 条件：标记为本位币(USD) + 汇率为1(或无汇率) + vendor或description含中文
      if (
        itemCurrency === tenantBaseCurrency &&
        (rate === 0 || Math.abs(rate - 1) < 0.01) &&
        itemAmount > 0 &&
        (hasCJKPattern.test(item.vendor || '') || hasCJKPattern.test(item.description || ''))
      ) {
        // 高度可疑：本来应该是 CNY 但被标为 USD
        // 推断实际币种（中文 vendor → CNY，日文 → JPY，韩文 → KRW）
        const vendorText = (item.vendor || '') + (item.description || '');
        let actualCurrency: CurrencyType = 'CNY'; // 默认推断为 CNY
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(vendorText)) actualCurrency = 'JPY';
        if (/[\uac00-\ud7af]/.test(vendorText)) actualCurrency = 'KRW';

        console.warn(`[CurrencyAutoFix] Item "${item.vendor || item.description}" submitted as ${tenantBaseCurrency} with rate=${rate}, but vendor contains CJK chars. Correcting to ${actualCurrency}`);

        // 纠正币种并重新转换
        item.currency = actualCurrency;
        try {
          const conversion = await exchangeRateService.convert({
            amount: itemAmount,
            fromCurrency: actualCurrency,
            toCurrency: tenantBaseCurrency as CurrencyType,
          });
          item.exchangeRate = conversion.exchangeRate;
          item.amountInBaseCurrency = conversion.convertedAmount;
          console.log(`[CurrencyAutoFix] Corrected: ${actualCurrency} ${itemAmount} → ${tenantBaseCurrency} ${conversion.convertedAmount} (rate: ${conversion.exchangeRate})`);
        } catch (err) {
          console.error(`[CurrencyAutoFix] Conversion failed, using fallback`, err);
          const fallbackRates: Record<string, number> = { CNY: 0.138, JPY: 0.0067, KRW: 0.00073 };
          const fallbackRate = fallbackRates[actualCurrency] || 0.138;
          item.exchangeRate = fallbackRate;
          item.amountInBaseCurrency = Math.round(itemAmount * fallbackRate * 100) / 100;
        }
      }
    }

    // 服务端字段兼容：将 Agent 可能误传的 quantity/unit 映射为标准 nights 字段
    // OpenClaw 等 Bot 可能传 { quantity: 2, unit: "晚" } 而非 { nights: 2 }
    for (const item of items) {
      if (item.category === 'hotel' && !item.nights) {
        // 兼容 quantity 字段：quantity + unit 为天/晚相关时，映射为 nights
        if (item.quantity && parseInt(item.quantity) > 0) {
          const unit = (item.unit || '').toLowerCase();
          if (!unit || unit === '晚' || unit === '天' || unit === 'night' || unit === 'nights' || unit === 'day' || unit === 'days') {
            item.nights = parseInt(item.quantity);
          }
        }
      }
    }

    // 服务端补齐酒店住宿天数：如果有 checkInDate/checkOutDate 但缺少 nights，自动计算
    // 防止 Agent 传了日期但漏传 nights 导致限额按 1 晚计算
    for (const item of items) {
      if (item.category === 'hotel' && item.checkInDate && item.checkOutDate && !item.nights) {
        try {
          const checkIn = new Date(item.checkInDate);
          const checkOut = new Date(item.checkOutDate);
          const diffMs = checkOut.getTime() - checkIn.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            item.nights = diffDays;
          }
        } catch {
          // 日期解析失败，不做处理
        }
      }
    }

    // 应用政策限额约束（支持 per_day 和 per_month 类型）
    // 传入 nights/checkInDate/checkOutDate 以便多日住宿按 每日限额×天数 计算
    // 传入 tenantBaseCurrency 确保限额比较时货币一致
    const limitResult = await checkItemsLimit(
      authCtx.userId,
      tenantId,
      items.map((item: any) => ({
        category: item.category,
        amount: parseFloat(item.amount) || 0,
        amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
        date: item.date,
        location: item.location,
        nights: item.nights ? parseInt(item.nights) : undefined,
        checkInDate: item.checkInDate,
        checkOutDate: item.checkOutDate,
      })),
      tenantBaseCurrency as CurrencyType
    );

    // 使用调整后的金额更新 items
    const adjustedItems = items.map((item: any, index: number) => {
      const limitItem = limitResult.items[index];
      // 计算调整后的原币金额（按比例调整）
      const originalUsd = item.amountInBaseCurrency || parseFloat(item.amount) || 0;
      const adjustedUsd = limitItem.adjustedAmount;
      const ratio = originalUsd > 0 ? adjustedUsd / originalUsd : 1;
      const adjustedOriginalAmount = (parseFloat(item.amount) || 0) * ratio;

      return {
        ...item,
        amount: adjustedOriginalAmount,
        amountInBaseCurrency: adjustedUsd,
        originalAmount: parseFloat(item.amount) || 0,
        originalAmountInBaseCurrency: originalUsd,
        wasAdjusted: limitItem.wasAdjusted,
      };
    });

    // 检查缺失凭证的 items — 缺凭证直接拒绝创建
    const missingReceiptItems = adjustedItems
      .filter((item: any) => !item.receiptUrl)
      .map((item: any) => `${item.category}: ${item.description || item.amount}`);
    if (missingReceiptItems.length > 0) {
      return apiError(
        `以下费用项缺少凭证附件（receiptUrl），请先上传凭证再提交：${missingReceiptItems.join('、')}`,
        400,
        'MISSING_RECEIPT',
      );
    }

    // 检查重复费用项（同一报销单内 category+amount+date 相同）
    const itemKeys = adjustedItems.map((item: any) =>
      `${item.category}_${parseFloat(item.amount) || 0}_${item.date}`
    );
    const duplicateKeys = itemKeys.filter((key: string, idx: number) => itemKeys.indexOf(key) !== idx);
    if (duplicateKeys.length > 0) {
      const dupes = (Array.from(new Set(duplicateKeys)) as string[]).map((k) => {
        const parts = k.split('_');
        return `${parts[0]}: ${parts[1]} (${parts[2]})`;
      });
      return apiError(
        `发现重复费用项（类别+金额+日期相同），请确认是否误传：${dupes.join('、')}`,
        400,
        'DUPLICATE_ITEMS',
      );
    }

    // 综合去重检查：跨报销单 + 发票号码 + 凭证 URL
    const dedupResult = await checkDuplicates(
      authCtx.userId,
      tenantId,
      adjustedItems.map((item: any) => ({
        category: item.category,
        amount: parseFloat(item.amount) || 0,
        date: item.date,
        invoiceNumber: item.invoiceNumber || undefined,
        receiptUrl: item.receiptUrl || undefined,
        description: item.description,
      }))
    );

    // 收集去重信息：硬拦截 (error) 和 软提示 (warning)
    const dedupErrors = dedupResult.warnings.filter(w => w.severity === 'error');
    const dedupWarnings = dedupResult.warnings.filter(w => w.severity === 'warning');

    // 发票号码重复 → 硬拦截，禁止创建
    if (dedupErrors.length > 0) {
      return apiError(
        `检测到重复报销：${dedupErrors.map(w => w.message).join('；')}`,
        409,
        'DUPLICATE_DETECTED',
      );
    }

    // 计算原币总金额（使用调整后的金额）
    const totalAmount = adjustedItems.reduce(
      (sum: number, item: any) => sum + (parseFloat(item.amount) || 0),
      0
    );

    // 计算美元总金额（如果前端未提供则使用原币金额）
    const usdTotal = adjustedItems.reduce(
      (sum: number, item: any) => sum + (item.amountInBaseCurrency || parseFloat(item.amount) || 0),
      0
    );

    // Auto-compute trip date range from travel items if description not provided
    let finalDescription = description || null;
    if (!finalDescription) {
      const TRAVEL_CATS_FOR_DATES = ['flight', 'train', 'hotel', 'taxi', 'car_rental', 'fuel', 'parking', 'toll'];
      const travelDates = items
        .filter((item: any) => TRAVEL_CATS_FOR_DATES.includes(item.category))
        .flatMap((item: any) => {
          const dates: string[] = [];
          if (item.date) dates.push(item.date);
          if (item.checkInDate) dates.push(item.checkInDate);
          if (item.checkOutDate) dates.push(item.checkOutDate);
          return dates;
        })
        .map((d: string) => new Date(d))
        .filter((d: Date) => !isNaN(d.getTime()))
        .sort((a: Date, b: Date) => a.getTime() - b.getTime());

      if (travelDates.length > 0) {
        const startDate = travelDates[0];
        const endDate = travelDates[travelDates.length - 1];
        const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
        finalDescription = startDate.getTime() === endDate.getTime()
          ? `出差日期：${fmt(startDate)}`
          : `出差日期：${fmt(startDate)} ~ ${fmt(endDate)}`;
      }
    }

    // 构建报销单数据（不包含 undefined 值）
    const reimbursementData: any = {
      tenantId: tenantId,
      userId: authCtx.userId,
      title,
      description: finalDescription,
      totalAmount,
      totalAmountInBaseCurrency: usdTotal,
      baseCurrency: tenantBaseCurrency,
      status: submitStatus === 'pending' ? 'pending' : 'draft',
      autoCollected: authCtx.authType === 'api_key',
      sourceType: authCtx.authType === 'api_key' ? `agent:${authCtx.apiKey?.agentType || 'api'}` : 'manual',
    };

    // 只有当有值时才添加这些字段
    if (tripId) {
      reimbursementData.tripId = tripId;
    }
    if (submitStatus === 'pending') {
      reimbursementData.submittedAt = new Date();
    }

    // 创建报销单
    const [reimbursement] = await db
      .insert(reimbursements)
      .values(reimbursementData)
      .returning();

    // 创建费用明细（使用调整后的金额）
    if (adjustedItems.length > 0) {
      // 解析日期，支持多种格式
      const parseDate = (dateStr: string): Date => {
        if (!dateStr) return new Date();
        // 尝试直接解析 ISO 格式 (YYYY-MM-DD)
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) return isoDate;
        // 尝试解析 YYYY/MM/DD 格式
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date();
      };

      await db.insert(reimbursementItems).values(
        adjustedItems.map((item: any) => {
          const itemData: any = {
            reimbursementId: reimbursement.id,
            category: item.category,
            description: item.description || item.category || '费用',
            amount: parseFloat(item.amount) || 0,
            currency: item.currency || 'CNY',
            exchangeRate: item.exchangeRate || null,
            amountInBaseCurrency: item.amountInBaseCurrency || parseFloat(item.amount) || 0,
            date: parseDate(item.date),
            location: item.location || null,
            vendor: item.vendor || null,
            receiptUrl: item.receiptUrl || null,
            invoiceNumber: item.invoiceNumber || null,
          };
          // Add hotel-specific fields
          if (item.checkInDate) {
            itemData.checkInDate = parseDate(item.checkInDate);
          }
          if (item.checkOutDate) {
            itemData.checkOutDate = parseDate(item.checkOutDate);
          }
          if (item.nights) {
            itemData.nights = item.nights;
          }
          return itemData;
        })
      );
    }

    // 构建返回数据，包含限额调整信息
    const responseData: any = {
      success: true,
      data: reimbursement,
    };

    // 如果有金额被调整，返回提示信息
    if (limitResult.totalAdjusted > 0) {
      responseData.limitAdjustments = {
        count: limitResult.totalAdjusted,
        messages: limitResult.messages,
        message: `有 ${limitResult.totalAdjusted} 项费用超过政策限额，已自动调整`,
      };
    }

    // 如果有去重警告（非硬拦截），返回提示信息让 Agent/用户知晓
    if (dedupWarnings.length > 0) {
      responseData.duplicateWarnings = {
        count: dedupWarnings.length,
        messages: dedupWarnings.map(w => w.message),
        message: `检测到 ${dedupWarnings.length} 项疑似重复，请确认是否正确`,
      };
    }

    // Agent 审计日志
    if (authCtx.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId: tenantId,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: submitStatus === 'pending' ? 'reimbursement:submit' : 'reimbursement:create',
        method: 'POST',
        path: '/api/reimbursements',
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: {
          title,
          itemCount: items.length,
          totalAmount,
          status: submitStatus || 'draft',
        },
        responseSummary: { reimbursementId: reimbursement.id },
        entityType: 'reimbursement',
        entityId: reimbursement.id,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        durationMs: Date.now() - startTime,
      });
    }

    // 自动生成差旅行程单（仅 Agent/API 提交时异步生成，浏览器提交由前端处理，避免重复生成）
    if (authCtx.authType === 'api_key') {
      const TRAVEL_CATEGORIES = ['flight', 'train', 'hotel', 'meal', 'taxi', 'car_rental', 'fuel', 'parking', 'toll'];
      const hasTravelItems = items.some((item: any) => TRAVEL_CATEGORIES.includes(item.category));
      if (hasTravelItems) {
        // 异步生成，不阻塞主请求返回
        generateTripItinerary(
          tenantId,
          authCtx.userId,
          reimbursement.id,
          title,
          items
        ).catch(err => console.error('Auto-generate itinerary failed (non-blocking):', err));
      }
    }

    const jsonResponse = withRateHeaders(NextResponse.json(responseData), authCtx);

    // 缓存幂等性响应
    if (idempotencyKey) {
      cacheResponse(idempotencyKey, jsonResponse).catch(() => {});
    }

    return jsonResponse;
  } catch (error: any) {
    console.error('Create reimbursement error:', error);
    return apiError(`创建失败: ${error?.message || '未知错误'}`, 500);
  }
}

/**
 * 自动生成差旅行程单（后台异步执行）
 * 报销单创建成功后，如果包含差旅类别费用项，自动调用 AI 生成 draft 行程单
 */
async function generateTripItinerary(
  tenantId: string,
  userId: string,
  reimbursementId: string,
  title: string,
  items: any[]
) {
  try {
    // 构建 AI prompt
    const itemsSummary = items.map((item: any, index: number) => {
      const parts = [`第${index + 1}项：`];
      parts.push(`类别: ${item.category}`);
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.vendor) parts.push(`供应商: ${item.vendor}`);
      if (item.amount) parts.push(`金额: ${item.currency || 'CNY'} ${item.amount}`);
      if (item.date) parts.push(`日期: ${item.date}`);
      if (item.departure) parts.push(`出发地: ${item.departure}`);
      if (item.destination) parts.push(`目的地: ${item.destination}`);
      if (item.trainNumber) parts.push(`车次: ${item.trainNumber}`);
      if (item.flightNumber) parts.push(`航班: ${item.flightNumber}`);
      if (item.seatClass) parts.push(`座位: ${item.seatClass}`);
      if (item.checkInDate) parts.push(`入住: ${item.checkInDate}`);
      if (item.checkOutDate) parts.push(`退房: ${item.checkOutDate}`);
      return parts.join(', ');
    }).join('\n');

    const systemPrompt = `你是一个智能行程生成助手。根据用户提交的报销费用明细，智能推断并生成一份完整的差旅行程单。

要求：
1. 根据交通票据（机票、火车票）的出发地、目的地、日期推断行程路线
2. 根据酒店入住信息补充住宿安排
3. 根据餐饮、交通等费用补充日程中的相关活动
4. 按时间顺序排列行程节点
5. 为每个节点推断合理的时间（如航班通常早晨，酒店入住通常下午）
6. 生成一个简洁的行程标题

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "行程标题，如：上海-北京出差",
  "purpose": "推断的出差目的",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "destinations": ["目的地1", "目的地2"],
  "items": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:mm",
      "type": "transport|hotel|meal|meeting|other",
      "category": "对应报销类别如flight/train/hotel/meal/taxi",
      "title": "节点标题",
      "description": "详细描述",
      "location": "地点",
      "departure": "出发地（交通类）",
      "arrival": "到达地（交通类）",
      "transportNumber": "车次/航班号",
      "hotelName": "酒店名称（住宿类）",
      "checkIn": "YYYY-MM-DD（住宿类）",
      "checkOut": "YYYY-MM-DD（住宿类）",
      "amount": 金额数字,
      "currency": "币种",
      "sourceItemIndex": 对应报销明细的索引号(从0开始),
      "sortOrder": 排序号
    }
  ]
}`;

    const userPrompt = `报销说明：${title || '未填写'}

报销费用明细：
${itemsSummary}

请根据以上信息，推断并生成完整的差旅行程单。`;

    const response = await createChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3, max_tokens: 4096 }
    );

    const content = extractTextContent(response);

    // 解析 AI 返回的 JSON
    let itinerary;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      itinerary = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[Auto-itinerary] Failed to parse AI response:', content);
      return;
    }

    // 保存行程单到数据库（status=draft）
    const [saved] = await db
      .insert(tripItineraries)
      .values({
        tenantId,
        userId,
        reimbursementId,
        title: itinerary.title || title,
        purpose: itinerary.purpose || null,
        startDate: itinerary.startDate ? new Date(itinerary.startDate) : null,
        endDate: itinerary.endDate ? new Date(itinerary.endDate) : null,
        destinations: itinerary.destinations || [],
        status: 'draft',
        aiGenerated: true,
      })
      .returning();

    // 保存行程明细
    if (itinerary.items && itinerary.items.length > 0) {
      await db.insert(tripItineraryItems).values(
        itinerary.items.map((item: any, index: number) => {
          // 关联报销凭证
          const sourceIndex = item.sourceItemIndex;
          const sourceItem = (sourceIndex !== undefined && sourceIndex !== null && items[sourceIndex])
            ? items[sourceIndex] : null;

          return {
            itineraryId: saved.id,
            date: new Date(item.date),
            time: item.time || null,
            type: item.type || 'other',
            category: item.category || null,
            title: item.title,
            description: item.description || null,
            location: item.location || null,
            departure: item.departure || null,
            arrival: item.arrival || null,
            transportNumber: item.transportNumber || null,
            hotelName: item.hotelName || null,
            checkIn: item.checkIn ? new Date(item.checkIn) : null,
            checkOut: item.checkOut ? new Date(item.checkOut) : null,
            amount: item.amount ? parseFloat(item.amount) : null,
            currency: item.currency || null,
            reimbursementItemId: null,
            receiptUrl: sourceItem?.receiptUrl || null,
            sortOrder: item.sortOrder ?? index,
          };
        })
      );
    }

    console.log(`[Auto-itinerary] Generated draft itinerary ${saved.id} for reimbursement ${reimbursementId}`);
  } catch (error) {
    console.error('[Auto-itinerary] Generation failed:', error);
  }
}
