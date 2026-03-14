import { NextRequest, NextResponse } from 'next/server';
import { createReceiptOCRAgent } from '@/agents/receipt-ocr-agent';
import { apiError } from '@/lib/api-error';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { exchangeRateService } from '@/lib/currency/exchange-service';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { CurrencyType } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ocr - OCR 识别发票
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 *
 * Agent 调用时自动附带汇率转换结果。
 * 注意：推荐 Agent 使用 POST /api/upload 上传票据，会自动触发 OCR + 汇率转换，
 * 无需单独调用此端点。
 */
export async function POST(request: NextRequest) {
  try {
    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.RECEIPT_UPLOAD);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    const body = await request.json();
    const { imageUrl, imageBase64, mimeType } = body;

    if (!imageUrl && !imageBase64) {
      return apiError('imageUrl 或 imageBase64 至少提供一个', 400, 'MISSING_REQUIRED_FIELDS');
    }

    const agent = createReceiptOCRAgent();
    const result = await agent.recognize({
      imageUrl,
      imageBase64,
      mimeType,
    });

    // Agent 模式：自动附带汇率转换
    const responseData: Record<string, unknown> = { ...result };

    if (authCtx.authType === 'api_key' && result.amount && result.currency && authCtx.tenantId) {
      try {
        const tenantRecord = await db.query.tenants.findFirst({
          where: eq(tenants.id, authCtx.tenantId),
          columns: { baseCurrency: true },
        });
        const baseCurrency = (tenantRecord?.baseCurrency || 'USD') as CurrencyType;
        const itemCurrency = result.currency as CurrencyType;

        if (itemCurrency === baseCurrency) {
          responseData.exchangeRate = 1;
          responseData.amountInBaseCurrency = result.amount;
          responseData.baseCurrency = baseCurrency;
        } else {
          const conversion = await exchangeRateService.convert({
            amount: result.amount,
            fromCurrency: itemCurrency,
            toCurrency: baseCurrency,
          });
          responseData.exchangeRate = conversion.exchangeRate;
          responseData.amountInBaseCurrency = conversion.convertedAmount;
          responseData.baseCurrency = baseCurrency;
        }
      } catch (err) {
        console.warn('Exchange rate conversion failed during OCR:', err);
      }
    }

    // 异步收集样本用于学习（不阻塞主流程）
    if (result.type !== 'unknown' && authCtx.tenantId) {
      collectInvoiceSample(authCtx.tenantId, result).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('OCR error:', error);
    return apiError(
      error instanceof Error ? error.message : 'OCR 识别失败',
      500,
      'OCR_FAILED',
    );
  }
}

/**
 * 收集发票样本用于学习
 */
async function collectInvoiceSample(tenantId: string, result: any) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    await fetch(`${baseUrl}/api/skills/invoice-learning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        country: result.documentCountry || 'CN',
        type: result.type,
        category: result.category,
        isOfficialInvoice: result.isOfficialInvoice,
        invoiceValidation: result.invoiceValidation,
        confidence: result.confidence,
        vendor: result.vendor,
        amount: result.amount,
        currency: result.currency,
        collectedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('Failed to collect invoice sample:', error);
  }
}
