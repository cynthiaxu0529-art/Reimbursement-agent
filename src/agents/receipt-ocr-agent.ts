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
  // 票据验证字段
  documentCountry?: string;       // 票据所属国家
  isOfficialInvoice?: boolean;    // 是否为正式发票（非收据/水单）
  invoiceValidation?: {
    hasInvoiceCode: boolean;      // 是否有发票代码
    hasCheckCode: boolean;        // 是否有校验码
    hasTaxNumber: boolean;        // 是否有税号
    hasQRCode: boolean;           // 是否有二维码
    suggestedAction?: string;     // 建议操作
  };
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
        // 票据验证字段
        documentCountry: parsed.documentCountry || 'CN',
        isOfficialInvoice: parsed.isOfficialInvoice ?? this.inferIsOfficialInvoice(parsed),
        invoiceValidation: parsed.invoiceValidation,
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
   * 推断是否为正式发票
   */
  private inferIsOfficialInvoice(parsed: Record<string, unknown>): boolean {
    const type = this.mapReceiptType(parsed.type as string);

    // 火车票和机票行程单可直接报销
    if (type === 'train_ticket' || type === 'flight_itinerary') {
      return true;
    }

    // 增值税发票是正式发票
    if (type === 'vat_invoice' || type === 'vat_special') {
      return true;
    }

    // 酒店水单不是正式发票
    if (type === 'hotel_receipt') {
      // 检查是否有发票代码（正式发票的特征）
      if (parsed.invoiceNumber && (parsed.invoiceNumber as string).length >= 8) {
        return true;
      }
      return false;
    }

    // 其他类型根据是否有发票号码判断
    return !!parsed.invoiceNumber;
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
  "currency": "货币类型（CNY/USD/EUR/JPY/HKD等）",
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
  "rawText": "图片中识别出的原始文本",
  "documentCountry": "票据所属国家（CN/US/JP/HK/TW/EU等）",
  "isOfficialInvoice": 是否为正式发票（true/false）,
  "invoiceValidation": {
    "hasInvoiceCode": 是否有发票代码（中国发票特有，20位数字）,
    "hasCheckCode": 是否有校验码/验证码,
    "hasTaxNumber": 是否有纳税人识别号,
    "hasQRCode": 是否有二维码,
    "suggestedAction": "建议操作（如：'可用于报销'/'需补充正式发票'/'建议核验发票真伪'）"
  }
}

票据类型判断规则：
- 中国增值税发票：有发票代码(10/12位)、发票号码(8位)、校验码、二维码 → isOfficialInvoice=true
- 中国火车票：12306电子客票、纸质车票 → isOfficialInvoice=true（可直接报销）
- 中国机票行程单：航空运输电子客票行程单 → isOfficialInvoice=true（可直接报销）
- 酒店水单/结算单：只有消费明细，无发票代码 → isOfficialInvoice=false，suggestedAction="需补充正式发票"
- 美国Receipt：商家收据，无统一格式 → isOfficialInvoice=true（美国收据即可报销）
- 日本領収書：有登録番号(T+13位)为合规发票 → isOfficialInvoice=true
- 香港收据：无统一发票制度，收据即可 → isOfficialInvoice=true

注意事项：
1. 如果某个字段无法识别，使用 null
2. 金额应该是数字类型，不要包含货币符号
3. 日期使用 YYYY-MM-DD 格式
4. 重点判断是否为正式发票还是仅为消费凭证/水单
5. 对于中国酒店住宿，水单不能直接报销，需要正式增值税发票

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
