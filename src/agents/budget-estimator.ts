/**
 * 预算预估 Agent
 * 根据行程、政策、历史数据预估出差预算
 */

import type {
  Trip,
  TripBudget,
  Policy,
  BudgetEstimationRequest,
  BudgetEstimationResponse,
  ExpenseCategoryType,
  CurrencyType,
} from '@/types';
import { ExpenseCategory, Currency } from '@/types';

// ============================================================================
// 城市消费水平数据
// ============================================================================

interface CityTier {
  tier: 1 | 2 | 3 | 4;
  hotelMultiplier: number;
  mealMultiplier: number;
  taxiMultiplier: number;
}

const CITY_TIERS: Record<string, CityTier> = {
  // 一线城市
  北京: { tier: 1, hotelMultiplier: 1.6, mealMultiplier: 1.3, taxiMultiplier: 1.2 },
  上海: { tier: 1, hotelMultiplier: 1.6, mealMultiplier: 1.3, taxiMultiplier: 1.2 },
  广州: { tier: 1, hotelMultiplier: 1.4, mealMultiplier: 1.2, taxiMultiplier: 1.1 },
  深圳: { tier: 1, hotelMultiplier: 1.5, mealMultiplier: 1.3, taxiMultiplier: 1.2 },

  // 新一线城市
  杭州: { tier: 2, hotelMultiplier: 1.3, mealMultiplier: 1.1, taxiMultiplier: 1.0 },
  成都: { tier: 2, hotelMultiplier: 1.2, mealMultiplier: 1.0, taxiMultiplier: 0.9 },
  南京: { tier: 2, hotelMultiplier: 1.2, mealMultiplier: 1.1, taxiMultiplier: 1.0 },
  武汉: { tier: 2, hotelMultiplier: 1.1, mealMultiplier: 1.0, taxiMultiplier: 0.9 },
  苏州: { tier: 2, hotelMultiplier: 1.2, mealMultiplier: 1.0, taxiMultiplier: 0.9 },
  西安: { tier: 2, hotelMultiplier: 1.1, mealMultiplier: 0.9, taxiMultiplier: 0.9 },
  重庆: { tier: 2, hotelMultiplier: 1.1, mealMultiplier: 0.9, taxiMultiplier: 0.8 },
  天津: { tier: 2, hotelMultiplier: 1.2, mealMultiplier: 1.0, taxiMultiplier: 1.0 },

  // 默认值（二三线城市）
  default: { tier: 3, hotelMultiplier: 1.0, mealMultiplier: 1.0, taxiMultiplier: 1.0 },
};

// 基准费用（CNY）
const BASE_COSTS = {
  hotel: 400, // 每晚酒店基准价
  meal: 120, // 每日餐饮基准价
  taxi: 150, // 每日市内交通基准价
  domesticFlight: 1200, // 国内机票基准价（单程）
  internationalFlight: 5000, // 国际机票基准价（单程）
  train: 400, // 高铁基准价（单程）
};

// ============================================================================
// 预算预估器
// ============================================================================

export class BudgetEstimator {
  private policies: Policy[];
  private historicalData?: HistoricalTripData[];

  constructor(policies: Policy[], historicalData?: HistoricalTripData[]) {
    this.policies = policies;
    this.historicalData = historicalData;
  }

  /**
   * 预估行程预算
   */
  async estimate(request: BudgetEstimationRequest): Promise<BudgetEstimationResponse> {
    const { destination, startDate, endDate, tripType, travelers = 1 } = request;

    const days = this.calculateDays(startDate, endDate);
    const cityTier = this.getCityTier(destination);

    // 计算各类费用预估
    const breakdown = this.calculateBreakdown(
      destination,
      days,
      travelers,
      cityTier,
      request.includeCategories
    );

    // 获取政策限额
    const policyLimits = this.getPolicyLimits(breakdown);

    // 获取历史数据推荐
    const historicalRecommendation = this.getHistoricalRecommendation(
      destination,
      days,
      tripType
    );

    // 计算总预算
    const estimatedTotal = breakdown.reduce((sum, item) => sum + item.estimatedAmount, 0);
    const recommendedTotal = breakdown.reduce((sum, item) => sum + item.recommendedAmount, 0);

    // 生成说明
    const notes = this.generateNotes(breakdown, policyLimits, historicalRecommendation);

    return {
      estimated: {
        total: estimatedTotal,
        currency: Currency.CNY,
        breakdown: breakdown.map((b) => ({
          category: b.category,
          amount: b.estimatedAmount,
        })),
        estimatedBy: 'ai',
        confidence: 0.75,
      },
      recommended: {
        total: recommendedTotal,
        currency: Currency.CNY,
        breakdown: breakdown.map((b) => ({
          category: b.category,
          amount: b.recommendedAmount,
        })),
        estimatedBy: historicalRecommendation ? 'historical' : 'policy',
        confidence: historicalRecommendation ? 0.85 : 0.7,
        basedOnTrips: historicalRecommendation?.basedOnTrips,
      },
      basedOn: {
        policyLimits: true,
        historicalData: !!historicalRecommendation,
        similarTrips: historicalRecommendation?.similarTripsCount || 0,
      },
      breakdown,
      notes,
    };
  }

  /**
   * 计算天数
   */
  private calculateDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * 获取城市等级
   */
  private getCityTier(destination: string): CityTier {
    for (const [city, tier] of Object.entries(CITY_TIERS)) {
      if (destination.includes(city)) {
        return tier;
      }
    }
    return CITY_TIERS.default;
  }

  /**
   * 计算费用明细
   */
  private calculateBreakdown(
    destination: string,
    days: number,
    travelers: number,
    cityTier: CityTier,
    includeCategories?: ExpenseCategoryType[]
  ): BudgetEstimationResponse['breakdown'] {
    const breakdown: BudgetEstimationResponse['breakdown'] = [];
    const nights = Math.max(0, days - 1);

    // 默认包含的类别
    const defaultCategories: ExpenseCategoryType[] = [
      ExpenseCategory.FLIGHT,
      ExpenseCategory.HOTEL,
      ExpenseCategory.MEAL,
      ExpenseCategory.TAXI,
    ];

    const categories = includeCategories || defaultCategories;

    for (const category of categories) {
      let estimatedAmount = 0;
      let confidence = 0.7;

      switch (category) {
        case ExpenseCategory.FLIGHT:
          // 假设往返机票
          estimatedAmount = BASE_COSTS.domesticFlight * 2 * travelers;
          confidence = 0.6; // 机票价格波动大
          break;

        case ExpenseCategory.TRAIN:
          estimatedAmount = BASE_COSTS.train * 2 * travelers;
          confidence = 0.8;
          break;

        case ExpenseCategory.HOTEL:
          estimatedAmount =
            BASE_COSTS.hotel * cityTier.hotelMultiplier * nights * Math.ceil(travelers / 2);
          confidence = 0.75;
          break;

        case ExpenseCategory.MEAL:
          estimatedAmount = BASE_COSTS.meal * cityTier.mealMultiplier * days * travelers;
          confidence = 0.8;
          break;

        case ExpenseCategory.TAXI:
          estimatedAmount = BASE_COSTS.taxi * cityTier.taxiMultiplier * days;
          confidence = 0.7;
          break;

        default:
          estimatedAmount = 200 * days; // 其他费用的默认预估
          confidence = 0.5;
      }

      // 获取政策限额
      const policyLimit = this.getCategoryPolicyLimit(category, days);
      const recommendedAmount = policyLimit
        ? Math.min(estimatedAmount, policyLimit)
        : estimatedAmount;

      breakdown.push({
        category,
        estimatedAmount: Math.round(estimatedAmount),
        recommendedAmount: Math.round(recommendedAmount),
        policyLimit,
        historicalAverage: this.getHistoricalAverage(category, destination),
        confidence,
      });
    }

    return breakdown;
  }

  /**
   * 获取类别的政策限额
   */
  private getCategoryPolicyLimit(
    category: ExpenseCategoryType,
    days: number
  ): number | undefined {
    for (const policy of this.policies) {
      if (!policy.isActive) continue;

      for (const rule of policy.rules) {
        if (rule.category === category && rule.limit) {
          switch (rule.limit.type) {
            case 'per_day':
              return rule.limit.amount * days;
            case 'per_item':
              return rule.limit.amount;
            case 'per_trip':
              return rule.limit.amount;
            default:
              return rule.limit.amount;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * 获取政策限额汇总
   */
  private getPolicyLimits(
    breakdown: BudgetEstimationResponse['breakdown']
  ): Record<ExpenseCategoryType, number | undefined> {
    const limits: Record<string, number | undefined> = {};
    for (const item of breakdown) {
      limits[item.category] = item.policyLimit;
    }
    return limits as Record<ExpenseCategoryType, number | undefined>;
  }

  /**
   * 获取历史数据推荐
   */
  private getHistoricalRecommendation(
    destination: string,
    days: number,
    tripType?: string
  ): { basedOnTrips: string[]; similarTripsCount: number } | undefined {
    if (!this.historicalData || this.historicalData.length === 0) {
      return undefined;
    }

    // 查找相似行程
    const similarTrips = this.historicalData.filter((trip) => {
      const daysDiff = Math.abs(trip.days - days);
      const sameDestination = trip.destination.includes(destination) ||
                              destination.includes(trip.destination);
      const sameType = !tripType || trip.tripType === tripType;

      return daysDiff <= 2 && (sameDestination || sameType);
    });

    if (similarTrips.length === 0) {
      return undefined;
    }

    return {
      basedOnTrips: similarTrips.slice(0, 5).map((t) => t.tripId),
      similarTripsCount: similarTrips.length,
    };
  }

  /**
   * 获取历史平均值
   */
  private getHistoricalAverage(
    category: ExpenseCategoryType,
    destination: string
  ): number | undefined {
    if (!this.historicalData || this.historicalData.length === 0) {
      return undefined;
    }

    const relevantTrips = this.historicalData.filter((trip) =>
      trip.destination.includes(destination) || destination.includes(trip.destination)
    );

    if (relevantTrips.length === 0) {
      return undefined;
    }

    const categoryExpenses = relevantTrips
      .flatMap((trip) => trip.expenses.filter((e) => e.category === category))
      .map((e) => e.amount);

    if (categoryExpenses.length === 0) {
      return undefined;
    }

    return Math.round(
      categoryExpenses.reduce((a, b) => a + b, 0) / categoryExpenses.length
    );
  }

  /**
   * 生成说明
   */
  private generateNotes(
    breakdown: BudgetEstimationResponse['breakdown'],
    policyLimits: Record<ExpenseCategoryType, number | undefined>,
    historicalRecommendation?: { basedOnTrips: string[]; similarTripsCount: number }
  ): string[] {
    const notes: string[] = [];

    // 检查超出政策限额的项目
    for (const item of breakdown) {
      if (item.policyLimit && item.estimatedAmount > item.policyLimit) {
        notes.push(
          `${item.category} 预估费用可能超出政策限额，建议控制在 ¥${item.policyLimit} 以内`
        );
      }
    }

    // 历史数据说明
    if (historicalRecommendation) {
      notes.push(
        `推荐预算基于 ${historicalRecommendation.similarTripsCount} 次相似行程的历史数据`
      );
    } else {
      notes.push('暂无相似行程的历史数据，预算基于公司政策和城市消费水平预估');
    }

    // 机票提示
    const flightItem = breakdown.find((b) => b.category === ExpenseCategory.FLIGHT);
    if (flightItem && flightItem.confidence < 0.7) {
      notes.push('机票价格波动较大，建议提前预订以获得更好的价格');
    }

    return notes;
  }
}

// ============================================================================
// 类型定义
// ============================================================================

interface HistoricalTripData {
  tripId: string;
  destination: string;
  days: number;
  tripType: string;
  totalSpent: number;
  expenses: {
    category: ExpenseCategoryType;
    amount: number;
  }[];
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createBudgetEstimator(
  policies: Policy[],
  historicalData?: HistoricalTripData[]
): BudgetEstimator {
  return new BudgetEstimator(policies, historicalData);
}
