import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

// 支持的国家列表及其发票规则
export const SUPPORTED_COUNTRIES: Record<string, {
  name: string;
  officialInvoiceRequired: boolean;
  invoiceFeatures: string[];
  acceptableDocuments: string[];
}> = {
  CN: {
    name: '中国',
    officialInvoiceRequired: true,
    invoiceFeatures: ['发票代码', '发票号码', '校验码', '二维码', '纳税人识别号'],
    acceptableDocuments: ['增值税专用发票', '增值税普通发票', '电子发票', '火车票', '机票行程单'],
  },
  US: {
    name: '美国',
    officialInvoiceRequired: false,
    invoiceFeatures: ['商家名称', '金额', '日期'],
    acceptableDocuments: ['Receipt', 'Invoice'],
  },
  JP: {
    name: '日本',
    officialInvoiceRequired: true,
    invoiceFeatures: ['登録番号(T+13位)', '取引年月日', '税率'],
    acceptableDocuments: ['適格請求書', '領収書'],
  },
  HK: {
    name: '香港',
    officialInvoiceRequired: false,
    invoiceFeatures: ['商家名称', '金额'],
    acceptableDocuments: ['Receipt', '收據'],
  },
  SG: {
    name: '新加坡',
    officialInvoiceRequired: false,
    invoiceFeatures: ['GST Registration Number(M+8位+字母)', '商家名称'],
    acceptableDocuments: ['Tax Invoice', 'Receipt'],
  },
  TW: {
    name: '台湾',
    officialInvoiceRequired: true,
    invoiceFeatures: ['統一編號', '發票號碼'],
    acceptableDocuments: ['統一發票', '電子發票'],
  },
  KR: {
    name: '韩国',
    officialInvoiceRequired: true,
    invoiceFeatures: ['사업자등록번호', '승인번호'],
    acceptableDocuments: ['세금계산서', '현금영수증'],
  },
  EU: {
    name: '欧盟',
    officialInvoiceRequired: true,
    invoiceFeatures: ['VAT号码', '卖方信息', '税率明细'],
    acceptableDocuments: ['VAT Invoice'],
  },
};

interface InvoiceSample {
  tenantId: string;
  country: string;
  type: string;
  category?: string;
  isOfficialInvoice?: boolean;
  invoiceValidation?: {
    hasInvoiceCode?: boolean;
    hasCheckCode?: boolean;
    hasTaxNumber?: boolean;
    hasQRCode?: boolean;
    suggestedAction?: string;
  };
  confidence?: number;
  vendor?: string;
  amount?: number;
  currency?: string;
  features?: Record<string, any>;
  collectedAt: string;
  // 用户反馈
  userFeedback?: {
    isCorrect: boolean;
    correctedType?: string;
    correctedCountry?: string;
    correctedIsOfficial?: boolean;
    comment?: string;
  };
}

/**
 * POST /api/skills/invoice-learning
 * 收集发票识别样本用于学习
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const sample: InvoiceSample = await request.json();

    // 验证必要字段
    if (!sample.country || !sample.type) {
      return NextResponse.json(
        { error: '缺少必要字段: country, type' },
        { status: 400 }
      );
    }

    // 存储到审计日志中（用于后续分析）
    await db.insert(auditLogs).values({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: 'invoice_sample_collected',
      entityType: 'invoice_learning',
      entityId: null,
      newValue: {
        ...sample,
        countryInfo: SUPPORTED_COUNTRIES[sample.country] || { name: sample.country },
      },
      metadata: {
        userAgent: request.headers.get('user-agent'),
        source: 'skill',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        country: sample.country,
        countryName: SUPPORTED_COUNTRIES[sample.country]?.name || sample.country,
        type: sample.type,
        collected: true,
      },
    });
  } catch (error) {
    console.error('Invoice learning error:', error);
    return NextResponse.json(
      { error: '收集样本失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/skills/invoice-learning
 * 获取发票学习统计数据
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country');

    // 获取统计数据
    const stats = await db.query.auditLogs.findMany({
      where: (logs, { eq, and }) => and(
        eq(logs.tenantId, session.user!.tenantId!),
        eq(logs.action, 'invoice_sample_collected')
      ),
      limit: 1000,
    });

    // 按国家统计
    const countryStats: Record<string, {
      total: number;
      types: Record<string, number>;
      officialRate: number;
      avgConfidence: number;
    }> = {};

    for (const log of stats) {
      const sample = log.newValue as InvoiceSample;
      if (!sample?.country) continue;
      if (country && sample.country !== country) continue;

      if (!countryStats[sample.country]) {
        countryStats[sample.country] = {
          total: 0,
          types: {},
          officialRate: 0,
          avgConfidence: 0,
        };
      }

      const cs = countryStats[sample.country];
      cs.total++;
      cs.types[sample.type] = (cs.types[sample.type] || 0) + 1;
      if (sample.isOfficialInvoice) {
        cs.officialRate = (cs.officialRate * (cs.total - 1) + 1) / cs.total;
      } else {
        cs.officialRate = (cs.officialRate * (cs.total - 1)) / cs.total;
      }
      if (sample.confidence) {
        cs.avgConfidence = (cs.avgConfidence * (cs.total - 1) + sample.confidence) / cs.total;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        supportedCountries: SUPPORTED_COUNTRIES,
        statistics: countryStats,
        totalSamples: stats.length,
      },
    });
  } catch (error) {
    console.error('Get invoice learning stats error:', error);
    return NextResponse.json(
      { error: '获取统计失败' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/skills/invoice-learning
 * 提交用户反馈（用于修正识别结果）
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const feedback = await request.json();
    const { sampleId, isCorrect, correctedType, correctedCountry, correctedIsOfficial, comment } = feedback;

    // 存储用户反馈
    await db.insert(auditLogs).values({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: 'invoice_feedback_submitted',
      entityType: 'invoice_learning',
      entityId: sampleId,
      newValue: {
        isCorrect,
        correctedType,
        correctedCountry,
        correctedIsOfficial,
        comment,
        submittedAt: new Date().toISOString(),
      },
      metadata: {
        source: 'user_feedback',
      },
    });

    return NextResponse.json({
      success: true,
      message: '反馈已提交，将用于改进识别准确率',
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    return NextResponse.json(
      { error: '提交反馈失败' },
      { status: 500 }
    );
  }
}
