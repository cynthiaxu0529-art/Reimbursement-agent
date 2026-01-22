/**
 * 票据 OCR Agent
 * 使用 AI 识别发票和收据中的信息
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  Receipt,
  OCRResult,
  ExpenseCategoryType,
  CurrencyType,
} from '@/types';
import { ExpenseCategory, Currency } from '@/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface OCRRequest {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface ParsedReceipt {
  type: ReceiptType;
  vendor?: string;
  amount?: number;
  currency?: CurrencyType;
  date?: Date;
  invoiceNumber?: string;
  taxNumber?: string;
  items?: ReceiptItem[];
  category?: ExpenseCategoryType;
  confidence: number;
  rawText: string;
}

export type ReceiptType =
  | 'vat_invoice'        // 增值税发票
  | 'vat_special'        // 增值税专用发票
  | 'flight_itinerary'   // 机票行程单
  | 'train_ticket'       // 火车票
  | 'hotel_receipt'      // 酒店水单
  | 'taxi_receipt'       // 出租车发票
  | 'ride_hailing'       // 网约车发票
  | 'restaurant'         // 餐饮发票
  | 'general_receipt'    // 通用收据
  | 'unknown';

export interface ReceiptItem {
  name: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
}

// ============================================================================
// OCR Agent 实现
// ============================================================================

export class ReceiptOCRAgent {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /**
   * 识别票据
   */
  async recognize(request: OCRRequest): Promise<ParsedReceipt> {
    const imageContent = await this.buildImageContent(request);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: OCR_PROMPT,
            },
          ],
        },
      ],
    });

    // 解析响应
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('OCR failed: no text response');
    }

    return this.parseOCRResponse(textContent.text);
  }

  /**
   * 批量识别票据
   */
  async recognizeBatch(requests: OCRRequest[]): Promise<ParsedReceipt[]> {
    const results = await Promise.all(
      requests.map((request) =>
        this.recognize(request).catch((error) => ({
          type: 'unknown' as const,
          confidence: 0,
          rawText: '',
          error: error.message,
        }))
      )
    );

    return results as ParsedReceipt[];
  }

  /**
   * 构建图片内容
   * 如果提供 URL，先下载并转换为 base64
   */
  private async buildImageContent(
    request: OCRRequest
  ): Promise<Anthropic.ImageBlockParam> {
    if (request.imageUrl) {
      // 下载图片并转换为 base64
      const { base64, mimeType } = await this.downloadImageAsBase64(request.imageUrl);
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64,
        },
      };
    }

    if (request.imageBase64) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: request.mimeType || 'image/jpeg',
          data: request.imageBase64,
        },
      };
    }

    throw new Error('Either imageUrl or imageBase64 is required');
  }

  /**
   * 下载图片并转换为 base64
   */
  private async downloadImageAsBase64(
    url: string
  ): Promise<{ base64: string; mimeType: MediaType }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = this.normalizeMimeType(contentType);

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return { base64, mimeType };
  }

  /**
   * 标准化 MIME 类型
   */
  private normalizeMimeType(contentType: string): MediaType {
    const type = contentType.split(';')[0].trim().toLowerCase();
    if (type === 'image/png') return 'image/png';
    if (type === 'image/webp') return 'image/webp';
    if (type === 'image/gif') return 'image/gif';
    return 'image/jpeg';
  }

  /**
   * 解析 OCR 响应
   */
  private parseOCRResponse(text: string): ParsedReceipt {
    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      const parsed = JSON.parse(jsonStr);

      return {
        type: this.mapReceiptType(parsed.type),
        vendor: parsed.vendor,
        amount: parsed.amount,
        currency: this.mapCurrency(parsed.currency),
        date: parsed.date ? new Date(parsed.date) : undefined,
        invoiceNumber: parsed.invoiceNumber,
        taxNumber: parsed.taxNumber,
        items: parsed.items,
        category: this.inferCategory(parsed),
        confidence: parsed.confidence || 0.8,
        rawText: parsed.rawText || text,
      };
    } catch (error) {
      // 如果 JSON 解析失败，返回低置信度结果
      return {
        type: 'unknown',
        confidence: 0.3,
        rawText: text,
      };
    }
  }

  /**
   * 映射票据类型
   */
  private mapReceiptType(type: string): ReceiptType {
    const typeMap: Record<string, ReceiptType> = {
      vat_invoice: 'vat_invoice',
      vat_special: 'vat_special',
      '增值税普通发票': 'vat_invoice',
      '增值税专用发票': 'vat_special',
      flight_itinerary: 'flight_itinerary',
      '机票行程单': 'flight_itinerary',
      '航空运输电子客票行程单': 'flight_itinerary',
      train_ticket: 'train_ticket',
      '火车票': 'train_ticket',
      hotel_receipt: 'hotel_receipt',
      '酒店发票': 'hotel_receipt',
      taxi_receipt: 'taxi_receipt',
      '出租车发票': 'taxi_receipt',
      ride_hailing: 'ride_hailing',
      '网约车发票': 'ride_hailing',
      restaurant: 'restaurant',
      '餐饮发票': 'restaurant',
    };

    return typeMap[type] || 'general_receipt';
  }

  /**
   * 映射货币
   */
  private mapCurrency(currency: string): CurrencyType {
    const currencyMap: Record<string, CurrencyType> = {
      CNY: Currency.CNY,
      RMB: Currency.CNY,
      '人民币': Currency.CNY,
      '¥': Currency.CNY,
      USD: Currency.USD,
      '$': Currency.USD,
      EUR: Currency.EUR,
      '€': Currency.EUR,
    };

    return currencyMap[currency] || Currency.CNY;
  }

  /**
   * 推断费用类别
   */
  private inferCategory(parsed: any): ExpenseCategoryType {
    const typeToCategory: Record<ReceiptType, ExpenseCategoryType> = {
      flight_itinerary: ExpenseCategory.FLIGHT,
      train_ticket: ExpenseCategory.TRAIN,
      hotel_receipt: ExpenseCategory.HOTEL,
      taxi_receipt: ExpenseCategory.TAXI,
      ride_hailing: ExpenseCategory.TAXI,
      restaurant: ExpenseCategory.MEAL,
      vat_invoice: ExpenseCategory.OTHER,
      vat_special: ExpenseCategory.OTHER,
      general_receipt: ExpenseCategory.OTHER,
      unknown: ExpenseCategory.OTHER,
    };

    const type = this.mapReceiptType(parsed.type);

    // 如果是通用发票，尝试从商家名称推断
    if (type === 'vat_invoice' || type === 'general_receipt') {
      const vendor = (parsed.vendor || '').toLowerCase();

      if (vendor.includes('酒店') || vendor.includes('hotel')) {
        return ExpenseCategory.HOTEL;
      }
      if (vendor.includes('餐') || vendor.includes('restaurant') || vendor.includes('食')) {
        return ExpenseCategory.MEAL;
      }
      if (vendor.includes('打印') || vendor.includes('复印')) {
        return ExpenseCategory.PRINTING;
      }
      if (vendor.includes('快递') || vendor.includes('物流')) {
        return ExpenseCategory.COURIER;
      }
    }

    return typeToCategory[type] || ExpenseCategory.OTHER;
  }

  /**
   * 验证发票真伪（调用税务接口）
   */
  async verifyInvoice(
    invoiceCode: string,
    invoiceNumber: string,
    invoiceDate: string,
    amount: number
  ): Promise<{
    isValid: boolean;
    message: string;
    details?: any;
  }> {
    // TODO: 接入税务局发票查验接口
    // 这里返回模拟结果
    return {
      isValid: true,
      message: '发票验证通过',
      details: {
        invoiceCode,
        invoiceNumber,
        checkTime: new Date().toISOString(),
      },
    };
  }
}

// ============================================================================
// OCR Prompt
// ============================================================================

const OCR_PROMPT = `请仔细分析这张票据/发票图片，提取以下信息并以 JSON 格式返回：

{
  "type": "票据类型（vat_invoice/vat_special/flight_itinerary/train_ticket/hotel_receipt/taxi_receipt/ride_hailing/restaurant/general_receipt）",
  "vendor": "商家/开票单位名称",
  "amount": 金额数字（不含货币符号）,
  "currency": "货币类型（CNY/USD/EUR等）",
  "date": "日期（YYYY-MM-DD格式）",
  "invoiceNumber": "发票号码",
  "taxNumber": "纳税人识别号",
  "items": [
    {
      "name": "项目名称",
      "quantity": 数量,
      "unitPrice": 单价,
      "amount": 金额
    }
  ],
  "confidence": 识别置信度（0-1之间的数字）,
  "rawText": "图片中识别出的原始文本"
}

注意事项：
1. 如果某个字段无法识别，使用 null
2. 金额应该是数字类型，不要包含货币符号
3. 日期使用 YYYY-MM-DD 格式
4. 对于机票行程单，注意提取航班号、起降时间、票价等信息
5. 对于火车票，注意提取车次、座位、票价等信息
6. 置信度根据图片清晰度和识别准确性估算

请用 JSON 代码块返回结果：
\`\`\`json
{你的JSON结果}
\`\`\``;

// ============================================================================
// 工厂函数
// ============================================================================

export function createReceiptOCRAgent(): ReceiptOCRAgent {
  return new ReceiptOCRAgent();
}

// ============================================================================
// API 路由处理器
// ============================================================================

export async function handleOCRRequest(
  imageUrl?: string,
  imageBase64?: string
): Promise<ParsedReceipt> {
  const agent = createReceiptOCRAgent();
  return agent.recognize({ imageUrl, imageBase64 });
}
