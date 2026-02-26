import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createChatCompletion, extractTextContent } from '@/lib/ai/openrouter-client';

export const dynamic = 'force-dynamic';

/**
 * 差旅类别列表（仅这些类别才需要生成行程）
 */
const TRAVEL_CATEGORIES = ['flight', 'train', 'hotel', 'meal', 'taxi', 'car_rental', 'fuel', 'parking', 'toll'];

/**
 * POST /api/trip-itineraries/generate - AI 智能生成行程
 * 根据报销明细项自动推断并生成完整行程单
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { items, description } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: '没有费用明细项' }, { status: 400 });
    }

    // 检查是否包含差旅类别
    const hasTravelItems = items.some((item: any) =>
      TRAVEL_CATEGORIES.includes(item.category)
    );

    if (!hasTravelItems) {
      return NextResponse.json({
        success: true,
        data: null,
        message: '非差旅报销，不需要生成行程',
      });
    }

    // 构建 prompt，让 AI 根据报销明细推断行程
    const itemsSummary = items.map((item: any, index: number) => {
      const parts = [`第${index + 1}项：`];
      parts.push(`类别: ${item.category}`);
      if (item.description) parts.push(`描述: ${item.description}`);
      if (item.vendor) parts.push(`供应商: ${item.vendor}`);
      if (item.amount) parts.push(`金额: ${item.currency || 'CNY'} ${item.amount}`);
      if (item.date) parts.push(`日期: ${item.date}`);
      if (item.departure) parts.push(`出发地: ${item.departure}`);
      if (item.destination) parts.push(`目的地: ${item.destination}`);
      if (item.trainNumber) parts.push(`车次: ${item.trainNumber}`);
      if (item.flightNumber) parts.push(`航班: ${item.flightNumber}`);
      if (item.seatClass) parts.push(`座位: ${item.seatClass}`);
      if (item.checkInDate) parts.push(`入住: ${item.checkInDate}`);
      if (item.checkOutDate) parts.push(`退房: ${item.checkOutDate}`);
      if (item.receiptUrl) parts.push(`有票据凭证`);
      return parts.join(', ');
    }).join('\n');

    const systemPrompt = `你是一个智能行程生成助手。根据用户提交的报销费用明细，智能推断并生成一份完整的差旅行程单。

要求：
1. 根据交通票据（机票、火车票）的出发地、目的地、日期推断行程路线
2. 根据酒店入住信息补充住宿安排
3. 根据餐饮、交通等费用补充日程中的相关活动
4. 按时间顺序排列行程节点
5. 为每个节点推断合理的时间（如航班通常早晨，酒店入住通常下午）
6. 生成一个简洁的行程标题

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "行程标题，如：上海-北京出差",
  "purpose": "推断的出差目的",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "destinations": ["目的地1", "目的地2"],
  "items": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:mm",
      "type": "transport|hotel|meal|meeting|other",
      "category": "对应报销类别如flight/train/hotel/meal/taxi",
      "title": "节点标题",
      "description": "详细描述",
      "location": "地点",
      "departure": "出发地（交通类）",
      "arrival": "到达地（交通类）",
      "transportNumber": "车次/航班号",
      "hotelName": "酒店名称（住宿类）",
      "checkIn": "YYYY-MM-DD（住宿类）",
      "checkOut": "YYYY-MM-DD（住宿类）",
      "amount": 金额数字,
      "currency": "币种",
      "sourceItemIndex": 对应报销明细的索引号(从0开始),
      "sortOrder": 排序号
    }
  ]
}`;

    const userPrompt = `报销说明：${description || '未填写'}

报销费用明细：
${itemsSummary}

请根据以上信息，推断并生成完整的差旅行程单。`;

    const response = await createChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.3,
        max_tokens: 4096,
      }
    );

    const content = extractTextContent(response);

    // 解析 AI 返回的 JSON
    let itinerary;
    try {
      // 尝试提取 JSON 块（兼容 markdown code block）
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      itinerary = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI itinerary response:', content);
      return NextResponse.json({
        success: false,
        error: '行程生成失败，AI 返回格式错误',
      }, { status: 500 });
    }

    // 关联报销明细 ID（通过 sourceItemIndex）
    if (itinerary.items) {
      itinerary.items = itinerary.items.map((item: any) => {
        const sourceIndex = item.sourceItemIndex;
        if (sourceIndex !== undefined && sourceIndex !== null && items[sourceIndex]) {
          const sourceItem = items[sourceIndex];
          return {
            ...item,
            reimbursementItemId: sourceItem.id || null,
            receiptUrl: sourceItem.receiptUrl || null,
          };
        }
        return item;
      });
    }

    return NextResponse.json({
      success: true,
      data: itinerary,
    });
  } catch (error: any) {
    console.error('Generate itinerary error:', error);
    return NextResponse.json(
      { error: `行程生成失败: ${error?.message || '未知错误'}` },
      { status: 500 }
    );
  }
}
