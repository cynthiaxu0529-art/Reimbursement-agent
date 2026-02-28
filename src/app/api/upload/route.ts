import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { apiError } from '@/lib/api-error';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { createReceiptOCRAgent } from '@/agents/receipt-ocr-agent';
import { exchangeRateService } from '@/lib/currency/exchange-service';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { CurrencyType } from '@/types';

// 强制动态渲染
export const dynamic = 'force-dynamic';

// 支持的文件类型
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

// 最大文件大小: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/upload - 上传票据文件
 * 支持双重认证：Session（浏览器）+ API Key（Agent/M2M）
 *
 * Agent 调用时自动触发 OCR 识别 + 汇率转换，返回完整的费用信息。
 * Agent 只需上传图片，系统负责识别金额、币种并转换为公司本位币。
 *
 * 请求体: FormData with 'file' field
 * 返回:
 *   - 基础: { success, url, filename, size, type }
 *   - Agent 模式额外返回: { ocr: { amount, currency, exchangeRate, amountInBaseCurrency, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    // 统一认证（支持 Session 和 API Key）
    const authResult = await authenticate(request, API_SCOPES.RECEIPT_UPLOAD);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('请选择要上传的文件', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return apiError(`不支持的文件类型: ${file.type}。支持: JPG, PNG, WebP, GIF, PDF`, 400, 'INVALID_FILE_TYPE');
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return apiError(`文件过大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400, 'FILE_TOO_LARGE');
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop() || 'bin';
    const filename = `receipts/${authCtx.userId}/${timestamp}-${randomStr}.${extension}`;

    // 上传到 Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false,
    });

    // 基础返回数据
    const responseData: Record<string, unknown> = {
      success: true,
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
    };

    // Agent 模式：自动触发 OCR + 汇率转换
    // 系统负责识别金额和币种，Agent 无需手动调 OCR 也无需计算汇率
    if (authCtx.authType === 'api_key') {
      try {
        const ocrAgent = createReceiptOCRAgent();
        const ocrResult = await ocrAgent.recognize({ imageUrl: blob.url });

        // 构建 OCR 结果
        const ocrData: Record<string, unknown> = {
          type: ocrResult.type,
          category: ocrResult.category,
          amount: ocrResult.amount,
          currency: ocrResult.currency,
          vendor: ocrResult.vendor,
          date: ocrResult.date,
          confidence: ocrResult.confidence,
          description: ocrResult.items?.map((i: { name: string }) => i.name).join(', ') || undefined,
          // 火车票/机票专用字段
          departure: ocrResult.departure,
          destination: ocrResult.destination,
          trainNumber: ocrResult.trainNumber,
          flightNumber: ocrResult.flightNumber,
          seatClass: ocrResult.seatClass,
          // 酒店专用字段
          checkInDate: ocrResult.checkInDate,
          checkOutDate: ocrResult.checkOutDate,
          nights: ocrResult.nights,
        };

        // 自动汇率转换：查找公司本位币并转换
        if (ocrResult.amount && ocrResult.currency && authCtx.tenantId) {
          try {
            const tenantRecord = await db.query.tenants.findFirst({
              where: eq(tenants.id, authCtx.tenantId),
              columns: { baseCurrency: true },
            });
            const baseCurrency = (tenantRecord?.baseCurrency || 'USD') as CurrencyType;
            const itemCurrency = ocrResult.currency as CurrencyType;

            if (itemCurrency === baseCurrency) {
              ocrData.exchangeRate = 1;
              ocrData.amountInBaseCurrency = ocrResult.amount;
              ocrData.baseCurrency = baseCurrency;
            } else {
              const conversion = await exchangeRateService.convert({
                amount: ocrResult.amount,
                fromCurrency: itemCurrency,
                toCurrency: baseCurrency,
              });
              ocrData.exchangeRate = conversion.exchangeRate;
              ocrData.amountInBaseCurrency = conversion.convertedAmount;
              ocrData.baseCurrency = baseCurrency;
            }
          } catch (err) {
            console.warn('Exchange rate conversion failed during upload OCR:', err);
            // 不阻塞上传，只是汇率转换失败
          }
        }

        responseData.ocr = ocrData;
      } catch (err) {
        console.warn('Auto-OCR failed during upload:', err);
        // OCR 失败不阻塞上传成功
        responseData.ocr = null;
        responseData.ocr_error = 'OCR 识别失败，请手动填写费用信息';
      }
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('Upload error:', error);

    // 检查是否是 Blob token 未配置的错误
    if (error.message?.includes('BLOB_READ_WRITE_TOKEN')) {
      return apiError('文件存储服务未配置，请联系管理员', 500, 'STORAGE_NOT_CONFIGURED');
    }

    return apiError(`上传失败: ${error.message || '未知错误'}`, 500);
  }
}
