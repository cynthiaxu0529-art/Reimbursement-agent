import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tenants, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { authenticate } from '@/lib/auth/api-key';
import { API_SCOPES } from '@/lib/auth/scopes';
import { apiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Default expense categories - used when tenant has no custom configuration.
 * These match the categories available in the frontend reimbursement form.
 */
const DEFAULT_CATEGORIES = [
  { value: 'flight', label: '机票', labelEn: 'Flight', icon: '✈️' },
  { value: 'train', label: '火车票', labelEn: 'Train', icon: '🚄' },
  { value: 'hotel', label: '酒店住宿', labelEn: 'Hotel', icon: '🏨' },
  { value: 'meal', label: '餐饮', labelEn: 'Meal', icon: '🍽️' },
  { value: 'taxi', label: '交通', labelEn: 'Taxi/Transport', icon: '🚕' },
  { value: 'office_supplies', label: '办公用品', labelEn: 'Office Supplies', icon: '📎' },
  { value: 'ai_token', label: 'AI 服务', labelEn: 'AI Service', icon: '🤖' },
  { value: 'cloud_resource', label: '云资源', labelEn: 'Cloud Resource', icon: '☁️' },
  { value: 'client_entertainment', label: '客户招待', labelEn: 'Client Entertainment', icon: '🤝' },
  { value: 'other', label: '其他', labelEn: 'Other', icon: '📦' },
];

/**
 * GET /api/settings/categories - Get available expense categories for the current tenant
 *
 * Returns the list of expense categories that the agent/user can use when creating reimbursements.
 * If the tenant has custom categories configured in settings, those are returned.
 * Otherwise, the system default categories are returned.
 *
 * Supports both Session (browser) and API Key (Agent) authentication.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticate(request, API_SCOPES.SETTINGS_READ);
    if (!authResult.success) {
      return apiError(authResult.error, authResult.statusCode);
    }

    const { context: authCtx } = authResult;
    const tenantId = authCtx.tenantId;

    if (!tenantId) {
      // Fallback: get tenantId from user record
      const user = await db.query.users.findFirst({
        where: eq(users.id, authCtx.userId),
        columns: { tenantId: true },
      });

      if (!user?.tenantId) {
        return NextResponse.json(
          { success: true, data: { categories: DEFAULT_CATEGORIES } }
        );
      }

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, user.tenantId),
        columns: { settings: true },
      });

      const categories = extractCategories(tenant?.settings);
      return NextResponse.json({ success: true, data: { categories } });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { settings: true },
    });

    const categories = extractCategories(tenant?.settings);
    return NextResponse.json({ success: true, data: { categories } });
  } catch (error) {
    console.error('Get categories error:', error);
    return apiError('获取费用类别失败', 500);
  }
}

/**
 * Extract categories from tenant settings.
 * If custom expenseCategories are configured and have enabled entries, use those.
 * Otherwise, fall back to DEFAULT_CATEGORIES.
 */
function extractCategories(settings: unknown): typeof DEFAULT_CATEGORIES {
  if (!settings || typeof settings !== 'object') {
    return DEFAULT_CATEGORIES;
  }

  const s = settings as Record<string, unknown>;
  const expenseCategories = s.expenseCategories as Array<{
    category: string;
    enabled: boolean;
    customName?: string;
  }> | undefined;

  if (!expenseCategories || !Array.isArray(expenseCategories) || expenseCategories.length === 0) {
    return DEFAULT_CATEGORIES;
  }

  // Filter to only enabled categories and map to the response format
  const enabledCategories = expenseCategories.filter(c => c.enabled);
  if (enabledCategories.length === 0) {
    return DEFAULT_CATEGORIES;
  }

  // Build response using custom config, matching with defaults for icon/label
  const defaultMap = new Map(DEFAULT_CATEGORIES.map(c => [c.value, c]));

  return enabledCategories.map(c => {
    const defaultCat = defaultMap.get(c.category);
    return {
      value: c.category,
      label: c.customName || defaultCat?.label || c.category,
      labelEn: defaultCat?.labelEn || c.category,
      icon: defaultCat?.icon || '📦',
    };
  });
}
