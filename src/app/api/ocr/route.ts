import { NextRequest, NextResponse } from 'next/server';
import { createReceiptOCRAgent } from '@/agents/receipt-ocr-agent';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, imageBase64, mimeType, collectForLearning = true } = body;

    if (!imageUrl && !imageBase64) {
      return NextResponse.json(
        { error: 'Either imageUrl or imageBase64 is required' },
        { status: 400 }
      );
    }

    const agent = createReceiptOCRAgent();
    const result = await agent.recognize({
      imageUrl,
      imageBase64,
      mimeType,
    });

    // 异步收集样本用于学习（不阻塞主流程）
    if (collectForLearning && result.type !== 'unknown') {
      const session = await auth();
      if (session?.user?.tenantId) {
        // 使用 Promise 但不等待，让它在后台执行
        collectInvoiceSample(session.user.tenantId, result).catch(console.error);
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('OCR error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'OCR failed',
      },
      { status: 500 }
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
    // 静默失败，不影响主流程
    console.error('Failed to collect invoice sample:', error);
  }
}
