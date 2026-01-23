/**
 * 票据 OCR Agent
 * 使用 AI 识别发票和收据中的信息
 */

import { OpenRouterClient } from '@/lib/ai/openrouter';
import type {
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
  // 火车票/机票专用字段
  departure?: string;      // 出发地
  destination?: string;    // 目的地
  trainNumber?: string;    // 车次号
  flightNumber?: string;   // 航班号
  seatClass?: string;      // 座位等级
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
  private client: OpenRouterClient;

  constructor() {
    this.client = new OpenRouterClient();
  }

  /**
   * 识别票据
   */
  async recognize(request: OCRRequest): Promise<ParsedReceipt> {
    const imageData = await this.buildImageData(request);

    const response = await this.client.vision(imageData, OCR_PROMPT);

    return this.parseOCRResponse(response);
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
   * 构建图片数据
   */
  private async buildImageData(
    request: OCRRequest
  ): Promise<{ url?: string; base64?: string; mimeType?: MediaType }> {
    if (request.imageUrl) {
      // 下载图片并转换为 base64
      const { base64, mimeType } = await this.downloadImageAsBase64(request.imageUrl);
      return { base64, mimeType };
    }

    if (request.imageBase64) {
      return {
        base64: request.imageBase64,
        mimeType: request.mimeType || 'image/jpeg',
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
        // 火车票/机票专用字段
        departure: parsed.departure,
        destination: parsed.destination,
        trainNumber: parsed.trainNumber,
        flightNumber: parsed.flightNumber,
        seatClass: parsed.seatClass,
      };
    } catch {
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
  private inferCategory(parsed: Record<string, unknown>): ExpenseCategoryType {
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

    const type = this.mapReceiptType(parsed.type as string);

    // 如果是通用发票，尝试从商家名称推断
    if (type === 'vat_invoice' || type === 'general_receipt') {
      const vendor = ((parsed.vendor as string) || '').toLowerCase();

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
    _invoiceDate: string,
    _amount: number
  ): Promise<{
    isValid: boolean;
    message: string;
    details?: Record<string, unknown>;
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
  "vendor": "商家/开票单位名称（火车票填写'中国铁路'，机票填写航空公司名称）",
  "amount": 金额数字（不含货币符号）,
  "currency": "货币类型（CNY/USD/EUR等）",
  "date": "日期（YYYY-MM-DD格式）",
  "invoiceNumber": "发票号码",
  "taxNumber": "纳税人识别号",
  "departure": "出发地/始发站（仅火车票和机票需要填写，如：北京、上海虹桥）",
  "destination": "目的地/终点站（仅火车票和机票需要填写，如：上海、北京首都）",
  "trainNumber": "火车车次号（仅火车票需要填写，如：G1234）",
  "flightNumber": "航班号（仅机票需要填写，如：CA1234）",
  "seatClass": "座位等级（火车：二等座/一等座/商务座；飞机：经济舱/公务舱/头等舱）",
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
4. 对于机票行程单，务必提取：航班号、出发地、目的地、舱位等级、票价
5. 对于火车票，务必提取：车次、出发站、到达站、座位等级、票价
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
