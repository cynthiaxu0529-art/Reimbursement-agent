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

      // 提取文档国家用于货币判断上下文
      const documentCountry = parsed.documentCountry || 'CN';

      return {
        type: this.mapReceiptType(parsed.type),
        vendor: parsed.vendor,
        amount: parsed.amount,
        currency: this.mapCurrency(parsed.currency, { documentCountry }),
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
   * 支持所有系统货币类型的识别，包括各种符号和名称变体
   */
  private mapCurrency(currency: string, context?: { documentCountry?: string }): CurrencyType {
    if (!currency) return Currency.CNY;

    const normalized = currency.trim().toUpperCase();

    // 完整的货币映射表
    const currencyMap: Record<string, CurrencyType> = {
      // 人民币
      CNY: Currency.CNY,
      RMB: Currency.CNY,
      '人民币': Currency.CNY,
      '元': Currency.CNY,

      // 美元
      USD: Currency.USD,
      'US$': Currency.USD,
      'US DOLLAR': Currency.USD,
      'U.S. DOLLAR': Currency.USD,
      '美元': Currency.USD,
      '美金': Currency.USD,

      // 欧元
      EUR: Currency.EUR,
      '€': Currency.EUR,
      EURO: Currency.EUR,
      '欧元': Currency.EUR,

      // 英镑
      GBP: Currency.GBP,
      '£': Currency.GBP,
      POUND: Currency.GBP,
      '英镑': Currency.GBP,

      // 日元
      JPY: Currency.JPY,
      '日元': Currency.JPY,
      '日圓': Currency.JPY,
      '円': Currency.JPY,
      YEN: Currency.JPY,

      // 港币
      HKD: Currency.HKD,
      'HK$': Currency.HKD,
      'HKD$': Currency.HKD,
      '港币': Currency.HKD,
      '港元': Currency.HKD,
      '港幣': Currency.HKD,

      // 新加坡元
      SGD: Currency.SGD,
      'S$': Currency.SGD,
      'SG$': Currency.SGD,
      'SGD$': Currency.SGD,
      '新币': Currency.SGD,
      '新加坡元': Currency.SGD,
      '新元': Currency.SGD,

      // 澳元
      AUD: Currency.AUD,
      'A$': Currency.AUD,
      'AU$': Currency.AUD,
      'AUD$': Currency.AUD,
      '澳元': Currency.AUD,
      '澳币': Currency.AUD,
      'AUSTRALIAN DOLLAR': Currency.AUD,

      // 加元 - 关键修复！
      CAD: Currency.CAD,
      'C$': Currency.CAD,
      'CA$': Currency.CAD,
      'CAN$': Currency.CAD,
      'CAD$': Currency.CAD,
      '加元': Currency.CAD,
      '加币': Currency.CAD,
      '加拿大元': Currency.CAD,
      'CANADIAN DOLLAR': Currency.CAD,

      // 韩元
      KRW: Currency.KRW,
      '₩': Currency.KRW,
      '韩元': Currency.KRW,
      '韓元': Currency.KRW,
      WON: Currency.KRW,
      'KOREAN WON': Currency.KRW,
    };

    // 直接匹配（不区分大小写）
    if (currencyMap[normalized]) {
      return currencyMap[normalized];
    }

    // 原始值匹配（保留大小写，用于中文）
    if (currencyMap[currency.trim()]) {
      return currencyMap[currency.trim()];
    }

    // ¥ 符号歧义处理：需要根据上下文判断是 CNY 还是 JPY
    if (normalized === '¥' || normalized === '￥') {
      // 根据文档来源国家判断
      if (context?.documentCountry === 'JP') {
        return Currency.JPY;
      }
      // 默认中国人民币
      return Currency.CNY;
    }

    // $ 符号歧义处理：默认 USD
    if (normalized === '$') {
      // 可根据上下文扩展判断 CAD/AUD/SGD/HKD
      if (context?.documentCountry === 'CA') return Currency.CAD;
      if (context?.documentCountry === 'AU') return Currency.AUD;
      if (context?.documentCountry === 'SG') return Currency.SGD;
      if (context?.documentCountry === 'HK') return Currency.HKD;
      return Currency.USD;
    }

    // 未知货币：记录警告并返回 CNY
    console.warn(`[OCR] Unknown currency detected: "${currency}", defaulting to CNY`);
    return Currency.CNY;
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
  "currency": "货币代码（必须使用三字母ISO代码：CNY/USD/EUR/GBP/JPY/HKD/SGD/AUD/CAD/KRW）",
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
- 新加坡Tax Invoice：有GST Registration Number(格式M+8位数字+字母，如M12345678A) → isOfficialInvoice=true
- 新加坡收据：无GST号码的普通收据也可报销 → isOfficialInvoice=true

【重要】货币识别规则：
1. 必须返回三字母ISO货币代码（CNY/USD/EUR/GBP/JPY/HKD/SGD/AUD/CAD/KRW），不要返回货币符号
2. $ 符号判断规则：
   - C$ 或 CA$ 或 CAN$ 或票据来自加拿大 → CAD（加元）
   - A$ 或 AU$ 或票据来自澳大利亚 → AUD（澳元）
   - S$ 或 SG$ 或票据来自新加坡 → SGD（新加坡元）
   - HK$ 或票据来自香港 → HKD（港币）
   - US$ 或其他情况 → USD（美元）
3. ¥ 符号判断规则：
   - 票据来自日本或标注"円"或日语文字 → JPY（日元）
   - 票据来自中国或标注"元"/"人民币" → CNY（人民币）
4. 根据票据语言、商家地址、税号格式等上下文信息判断货币类型
5. documentCountry 字段必须准确识别，这对货币判断至关重要

注意事项：
1. 如果某个字段无法识别，使用 null
2. 金额应该是数字类型，不要包含货币符号
3. 日期使用 YYYY-MM-DD 格式
4. 重点判断是否为正式发票还是仅为消费凭证/水单
5. 对于中国酒店住宿，水单不能直接报销，需要正式增值税发票
6. 加拿大票据请特别注意识别为 CAD，不要误识别为 CNY 或 USD

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
