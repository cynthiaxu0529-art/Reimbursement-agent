import { NextRequest, NextResponse } from 'next/server';
import { createReceiptOCRAgent } from '@/agents/receipt-ocr-agent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, imageBase64, mimeType } = body;

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
