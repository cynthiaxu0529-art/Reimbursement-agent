import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reimbursements, reimbursementItems, trips, tripItineraries, tripItineraryItems, tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authenticate, logAgentAction, type AuthContext } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { apiError } from '@/lib/api-error';
import { getIdempotencyKey, getCachedResponse, cacheResponse } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

/** 向响应注入 Rate Limit header */
function withRateHeaders(response: NextResponse, authCtx: AuthContext): NextResponse {
  if (authCtx.rateLimit) {
    response.headers.set('X-RateLimit-Limit', String(authCtx.rateLimit.limit));
    response.headers.set('X-RateLimit-Remaining', String(authCtx.rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(authCtx.rateLimit.resetAt));
  }
  return response;
}

/**
 * POST /api/reimbursements/flights
 *
 * 接收 flight-booking-service 的出票回调，一次性创建：
 * 1. Trip（行程记录，状态=ongoing）
 * 2. Reimbursement（报销单，状态=pending 自动提交）
 * 3. TripItinerary + TripItineraryItems（精确行程单，无需 AI 推断）
 *
 * 认证：API Key (Bearer rk_xxx)，需要 reimbursement:create scope
 * 幂等：使用 atlas_order_no 作为幂等键
 */
export async function POST(request: NextRequest) {
  try {
    // 幂等性检查
    const idempotencyKey = getIdempotencyKey(request);
    if (idempotencyKey) {
      const cached = getCachedResponse(idempotencyKey);
      if (cached) return cached;
    }

    // API Key 认证
    const authResult = await authenticate(request, API_SCOPES.REIMBURSEMENT_CREATE);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }
    const authCtx = authResult.context;
    const startTime = Date.now();

    const tenantId = authCtx.tenantId;
    if (!tenantId) {
      return apiError('用户未关联公司', 400, 'NO_TENANT');
    }

    const body = await request.json();
    const { atlas_order_no, pnr, flight, payment, attachments } = body;

    // 验证必填字段
    if (!atlas_order_no || !pnr || !flight || !payment) {
      return apiError(
        'Missing required fields: atlas_order_no, pnr, flight, payment',
        400,
        'MISSING_REQUIRED_FIELDS'
      );
    }

    if (!flight.airline || !flight.flight_number || !flight.origin || !flight.destination ||
        !flight.departure_time || !flight.arrival_time) {
      return apiError(
        'Missing flight details: airline, flight_number, origin, destination, departure_time, arrival_time',
        400,
        'MISSING_FLIGHT_DETAILS'
      );
    }

    if (!payment.amount || !payment.currency) {
      return apiError('Missing payment details: amount, currency', 400, 'MISSING_PAYMENT_DETAILS');
    }

    // Agent 金额限制检查
    if (authCtx.authType === 'api_key' && authCtx.apiKey?.limits.maxAmountPerRequest) {
      if (payment.amount > authCtx.apiKey.limits.maxAmountPerRequest) {
        return apiError(
          `Agent 单次报销金额超过限制（上限: ${authCtx.apiKey.limits.maxAmountPerRequest}）`,
          403,
          'AMOUNT_LIMIT_EXCEEDED'
        );
      }
    }

    // 获取租户本位币
    const tenantRecord = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { baseCurrency: true },
    });
    const baseCurrency = tenantRecord?.baseCurrency || 'USD';

    const departureDate = new Date(flight.departure_time);
    const arrivalDate = new Date(flight.arrival_time);
    const flightTitle = `${flight.origin}→${flight.destination} ${flight.airline}${flight.flight_number}`;
    const tripTitle = `${flight.origin}-${flight.destination} Business Trip`;

    // === 1. 创建 Trip（行程记录）===
    const [trip] = await db.insert(trips).values({
      tenantId,
      userId: authCtx.userId,
      title: tripTitle,
      destination: flight.destination,
      startDate: departureDate,
      endDate: arrivalDate,
      status: 'ongoing',
    }).returning();

    // === 2. 创建 Reimbursement（报销单）===
    // 检查是否有 submit scope，有则直接提交，否则创建草稿
    const hasSubmitScope = authCtx.authType === 'api_key' &&
      authCtx.apiKey?.scopes.includes(API_SCOPES.REIMBURSEMENT_SUBMIT);
    const reimbursementStatus = hasSubmitScope ? 'pending' : 'draft';

    const reimbursementData: any = {
      tenantId,
      userId: authCtx.userId,
      tripId: trip.id,
      title: `机票报销 - ${flightTitle}`,
      description: [
        `Atlas订单号: ${atlas_order_no}`,
        `PNR: ${pnr}`,
        flight.passenger?.name ? `旅客: ${flight.passenger.name}` : null,
        payment.tx_hash ? `支付交易: ${payment.tx_hash}` : null,
      ].filter(Boolean).join('\n'),
      totalAmount: payment.amount,
      totalAmountInBaseCurrency: payment.amount,
      baseCurrency,
      status: reimbursementStatus,
      autoCollected: true,
      sourceType: `agent:${authCtx.apiKey?.agentType || 'flight-booking'}`,
    };
    if (hasSubmitScope) {
      reimbursementData.submittedAt = new Date();
    }

    const [reimbursement] = await db.insert(reimbursements).values(reimbursementData).returning();

    // === 3. 创建 Reimbursement Item（费用明细）===
    const [reimbursementItem] = await db.insert(reimbursementItems).values({
      reimbursementId: reimbursement.id,
      category: 'flight',
      description: flightTitle,
      amount: payment.amount,
      currency: payment.currency,
      amountInBaseCurrency: payment.amount,
      date: departureDate,
      vendor: flight.airline,
      receiptUrl: attachments?.find((a: any) => a.type === 'e_ticket')?.url || null,
    }).returning();

    // === 4. 创建 TripItinerary + Items（精确行程单）===
    const [itinerary] = await db.insert(tripItineraries).values({
      tenantId,
      userId: authCtx.userId,
      reimbursementId: reimbursement.id,
      tripId: trip.id,
      title: tripTitle,
      purpose: '商务出差',
      startDate: departureDate,
      endDate: arrivalDate,
      destinations: [flight.destination],
      status: 'confirmed', // 精确数据，直接确认
      aiGenerated: false,  // 非 AI 生成，是真实出票数据
    }).returning();

    // 创建行程节点
    const itineraryItemsToInsert = [
      {
        itineraryId: itinerary.id,
        date: departureDate,
        time: departureDate.toTimeString().slice(0, 5),
        type: 'transport' as const,
        category: 'flight',
        title: flightTitle,
        description: [
          `${flight.airline} ${flight.flight_number}`,
          flight.passenger?.name ? `旅客: ${flight.passenger.name}` : null,
          `PNR: ${pnr}`,
        ].filter(Boolean).join(' | '),
        location: flight.origin,
        departure: flight.origin,
        arrival: flight.destination,
        transportNumber: `${flight.airline}${flight.flight_number}`,
        amount: payment.amount,
        currency: payment.currency,
        reimbursementItemId: reimbursementItem.id,
        receiptUrl: attachments?.find((a: any) => a.type === 'e_ticket')?.url || null,
        sortOrder: 0,
      },
      // 到达节点
      {
        itineraryId: itinerary.id,
        date: arrivalDate,
        time: arrivalDate.toTimeString().slice(0, 5),
        type: 'transport' as const,
        category: 'flight',
        title: `抵达 ${flight.destination}`,
        description: `${flight.airline}${flight.flight_number} 到达`,
        location: flight.destination,
        departure: flight.origin,
        arrival: flight.destination,
        transportNumber: `${flight.airline}${flight.flight_number}`,
        sortOrder: 1,
      },
    ];

    await db.insert(tripItineraryItems).values(itineraryItemsToInsert);

    // === 5. Agent 审计日志 ===
    if (authCtx.authType === 'api_key' && authCtx.apiKey) {
      logAgentAction({
        tenantId,
        apiKeyId: authCtx.apiKey.id,
        userId: authCtx.userId,
        action: 'flight:reimbursement:create',
        method: 'POST',
        path: '/api/reimbursements/flights',
        statusCode: 200,
        agentType: authCtx.apiKey.agentType,
        requestSummary: {
          atlas_order_no,
          pnr,
          flight: `${flight.origin}-${flight.destination} ${flight.airline}${flight.flight_number}`,
          amount: payment.amount,
          currency: payment.currency,
        },
        responseSummary: {
          reimbursementId: reimbursement.id,
          tripId: trip.id,
          itineraryId: itinerary.id,
        },
        entityType: 'reimbursement',
        entityId: reimbursement.id,
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
        durationMs: Date.now() - startTime,
      });
    }

    // === 6. 构建响应 ===
    const responseData = {
      success: true,
      reimbursement_id: reimbursement.id,
      trip_id: trip.id,
      itinerary_id: itinerary.id,
      itinerary_url: `/api/trip-itineraries/${itinerary.id}`,
      status: reimbursementStatus,
      data: {
        reimbursement: {
          id: reimbursement.id,
          title: reimbursement.title,
          status: reimbursement.status,
          totalAmount: reimbursement.totalAmount,
        },
        trip: {
          id: trip.id,
          title: trip.title,
          status: trip.status,
        },
        itinerary: {
          id: itinerary.id,
          title: itinerary.title,
          status: itinerary.status,
          itemCount: itineraryItemsToInsert.length,
        },
      },
    };

    const jsonResponse = withRateHeaders(NextResponse.json(responseData), authCtx);

    // 缓存幂等性响应
    if (idempotencyKey) {
      cacheResponse(idempotencyKey, jsonResponse).catch(() => {});
    }

    return jsonResponse;
  } catch (error: any) {
    console.error('Flight reimbursement error:', error);
    return apiError(`机票报销创建失败: ${error?.message || '未知错误'}`, 500);
  }
}
