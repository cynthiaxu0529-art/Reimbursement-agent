/**
 * 票据 OCR Agent
 * 使用 AI 识别发票和收据中的信息
 */

import { OpenRouterClient } from '@/lib/ai/openrouter';
import type {
  ExpenseCategoryType,
  CurrencyType,
} from '@/types';
import { ExpenseCategory } from '@/types';
import { mapCurrency, overrideCurrencyFromRawText } from './currency-utils';

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
  // 酒店专用字段
  checkInDate?: string;    // 入住日期 (YYYY-MM-DD)
  checkOutDate?: string;   // 离店日期 (YYYY-MM-DD)
  nights?: number;         // 住宿晚数
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

      // 文档国家只在模型明确给出时才作为货币消歧的上下文；
      // 不再默认 'CN'，避免缺失时把一切 ¥ 都误推成 CNY。
      const contextCountry: string | undefined = parsed.documentCountry || undefined;

      const rawTextStr = typeof parsed.rawText === 'string' ? parsed.rawText : text;
      const mappedCurrency = mapCurrency(parsed.currency, { documentCountry: contextCountry });
      const finalCurrency = overrideCurrencyFromRawText(mappedCurrency, rawTextStr, parsed.currency);

      return {
        type: this.mapReceiptType(parsed.type),
        vendor: parsed.vendor,
        amount: parsed.amount,
        currency: finalCurrency,
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
        // 酒店专用字段
        checkInDate: parsed.checkInDate,
        checkOutDate: parsed.checkOutDate,
        nights: parsed.nights ? parseInt(parsed.nights) : this.inferNights(parsed),
        // 票据验证字段（这里仍保留 'CN' 默认值以兼容下游的发票学习/分类逻辑，
        // 但上面的货币判断已经不再依赖这个 fallback）
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

    // 如果是通用发票/增值税发票，尝试从商家名称和描述推断
    if (type === 'vat_invoice' || type === 'vat_special' || type === 'general_receipt') {
      const vendor = ((parsed.vendor as string) || '').toLowerCase();
      const description = ((parsed.description as string) || '').toLowerCase();
      const combined = `${vendor} ${description}`;

      if (combined.includes('酒店') || combined.includes('hotel')) {
        return ExpenseCategory.HOTEL;
      }
      if (combined.includes('餐') || combined.includes('restaurant') || combined.includes('食')) {
        return ExpenseCategory.MEAL;
      }
      if (combined.includes('打印') || combined.includes('复印')) {
        return ExpenseCategory.PRINTING;
      }
      if (combined.includes('快递') || combined.includes('物流')) {
        return ExpenseCategory.COURIER;
      }
      // 市场推广：KOC/KOL 投放、红包活动、营销推广、广告投放等
      if (
        combined.includes('koc') ||
        combined.includes('kol') ||
        combined.includes('营销') ||
        combined.includes('推广') ||
        combined.includes('市场') ||
        combined.includes('广告') ||
        combined.includes('投放') ||
        combined.includes('红包活动') ||
        combined.includes('活动费') ||
        combined.includes('marketing')
      ) {
        return ExpenseCategory.MARKETING;
      }
      // 内容 & SEO：文案、内容制作、SEO/SEM、视频拍摄、博客等
      if (
        combined.includes('内容') ||
        combined.includes('文案') ||
        combined.includes('copywriting') ||
        combined.includes('seo') ||
        combined.includes('sem') ||
        combined.includes('搜索优化') ||
        combined.includes('视频制作') ||
        combined.includes('拍摄') ||
        combined.includes('博客') ||
        combined.includes('blog') ||
        combined.includes('content')
      ) {
        return ExpenseCategory.CONTENT_SEO;
      }
      // 公关 & 传播：新闻稿、媒体、公关、品牌传播等
      if (
        combined.includes('公关') ||
        combined.includes('新闻稿') ||
        combined.includes('press') ||
        combined.includes('媒体') ||
        combined.includes('传播') ||
        combined.includes('品牌传播') ||
        combined.includes('外宣') ||
        combined.includes('舆情') ||
        combined.includes('pr ')
      ) {
        return ExpenseCategory.PR_COMMUNICATIONS;
      }
    }

    return typeToCategory[type] || ExpenseCategory.OTHER;
  }

  /**
   * 从入住/离店日期推算住宿天数
   */
  private inferNights(parsed: Record<string, unknown>): number | undefined {
    if (!parsed.checkInDate || !parsed.checkOutDate) return undefined;
    try {
      const checkIn = new Date(parsed.checkInDate as string);
      const checkOut = new Date(parsed.checkOutDate as string);
      const diffMs = checkOut.getTime() - checkIn.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 1;
    } catch {
      return undefined;
    }
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
  "checkInDate": "入住日期（仅酒店票据需要填写，YYYY-MM-DD格式）",
  "checkOutDate": "离店日期（仅酒店票据需要填写，YYYY-MM-DD格式）",
  "nights": "住宿晚数（仅酒店票据需要填写，整数）",
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

【重要】货币识别规则（按优先级从高到低执行）：

**优先级 1（最高）：显式 ISO 代码或货币全称**
如果发票/票据上出现任何紧贴金额的显式 ISO 三字母代码（USD/EUR/GBP/JPY/HKD/SGD/AUD/CAD/KRW/CNY）
或对应的英文全称（"US Dollar(s)"/"Euros"/"Japanese Yen"/"Hong Kong Dollar"/"Canadian Dollar" 等），
**必须以此为准**，不得因为账单地址、税号、商家国籍等其他信号推翻。
例如：
  - 发票上写 "$110.00 USD"、"Amount due $X USD"、"Total: 110 USD"、"USD 110.00" → 必须返回 USD
  - 发票上写 "¥10,000 JPY"、"JPY 10,000" → 必须返回 JPY
  - 即使 Bill To 地址在日本、即使含 "Japan JCT" 或 "VAT" 字样，只要显式写了 USD，币种就是 USD。

**优先级 2：跨境 SaaS / 云服务发票的常见形态**
Anthropic、OpenAI、Stripe、AWS、Google Cloud、Microsoft Azure、GitHub、Vercel、Cloudflare、
Linear、Notion、Figma 等美国公司开具的发票，即使包含其他国家的 VAT/GST/JCT 合规信息
（如 "VAT Registration Japan JCT: T..."），**默认币种是 USD**，除非发票正面明确声明其他币种。
这类发票典型特征：开票方 Anthropic/Stripe/AWS 等在美国，Bill To 可能在任何国家，
但 "Amount due" 那一行会写明币种（通常是 $X.XX USD）。

**优先级 3：符号 + 上下文消歧**（仅当没有显式 ISO 代码时）
- $ 符号：
   - C$ / CA$ / CAN$ 或加拿大票据 → CAD（加元）
   - A$ / AU$ 或澳大利亚票据 → AUD（澳元）
   - S$ / SG$ 或新加坡票据 → SGD（新加坡元）
   - HK$ 或香港票据 → HKD（港币）
   - US$ 或其他情况 → USD（美元）
- ¥ 符号：
   - 票据来自日本、有 "円"、日语假名/汉字、Japan JCT 登録番号（T+13位） → JPY（日元）
   - 票据来自中国、有 "元"/"人民币"/中文增值税字样 → CNY（人民币）

**输出要求**
1. currency 字段必须返回三字母 ISO 代码（CNY/USD/EUR/GBP/JPY/HKD/SGD/AUD/CAD/KRW），**不要返回符号**
2. documentCountry 字段必须准确识别，是消歧的最后一环
3. rawText 字段必须完整收录票据上与币种相关的文字（至少包含 "Amount due"/"Total" 行和金额旁边的 ISO 代码），
   后端会用它做二次校验

【重要】酒店票据识别规则：
1. 必须提取入住日期(checkInDate)和离店日期(checkOutDate)，通常标注为"入住/Check-in"、"离店/Check-out"
2. 住宿晚数(nights)优先从票据上直接读取；如票据未标注，则从入住和离店日期计算（离店 - 入住 = 天数）
3. amount 应为住宿总金额（不是每晚单价）
4. date 字段填入住日期(checkInDate)

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
