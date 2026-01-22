/**
 * 默认 COA (Chart of Accounts) 映射配置
 * 将报销类别映射到财务系统的科目代码
 *
 * COA 结构遵循常见的企业会计科目体系
 * 6xxx - 费用类科目
 */

import { ExpenseCategory, type COAMapping, type ExpenseCategoryType } from '@/types';

/**
 * 默认 COA 映射
 * 企业可以根据自己的财务系统自定义
 */
export const DEFAULT_COA_MAPPINGS: COAMapping[] = [
  // ============================================
  // 6601 - 差旅费
  // ============================================
  {
    category: ExpenseCategory.FLIGHT,
    coaCode: '6601.01',
    coaName: '差旅费-机票',
    coaNameEn: 'Travel - Airfare',
    parentCode: '6601',
    description: '国内外机票费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.09,
  },
  {
    category: ExpenseCategory.TRAIN,
    coaCode: '6601.02',
    coaName: '差旅费-火车票',
    coaNameEn: 'Travel - Train',
    parentCode: '6601',
    description: '火车票费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.09,
  },
  {
    category: ExpenseCategory.HOTEL,
    coaCode: '6601.03',
    coaName: '差旅费-住宿',
    coaNameEn: 'Travel - Accommodation',
    parentCode: '6601',
    description: '酒店住宿费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.MEAL,
    coaCode: '6601.04',
    coaName: '差旅费-餐饮',
    coaNameEn: 'Travel - Meals',
    parentCode: '6601',
    description: '出差期间餐饮费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.TAXI,
    coaCode: '6601.05',
    coaName: '差旅费-市内交通',
    coaNameEn: 'Travel - Local Transportation',
    parentCode: '6601',
    description: '出租车、网约车费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.03,
  },
  {
    category: ExpenseCategory.CAR_RENTAL,
    coaCode: '6601.06',
    coaName: '差旅费-租车',
    coaNameEn: 'Travel - Car Rental',
    parentCode: '6601',
    description: '租车费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.13,
  },
  {
    category: ExpenseCategory.FUEL,
    coaCode: '6601.07',
    coaName: '差旅费-燃油',
    coaNameEn: 'Travel - Fuel',
    parentCode: '6601',
    description: '加油费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.13,
  },
  {
    category: ExpenseCategory.PARKING,
    coaCode: '6601.08',
    coaName: '差旅费-停车',
    coaNameEn: 'Travel - Parking',
    parentCode: '6601',
    description: '停车费用',
    isActive: true,
    requiresReceipt: false,
    requiresApproval: false,
    defaultTaxRate: 0.05,
  },
  {
    category: ExpenseCategory.TOLL,
    coaCode: '6601.09',
    coaName: '差旅费-过路费',
    coaNameEn: 'Travel - Toll',
    parentCode: '6601',
    description: '高速公路过路费',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.03,
  },

  // ============================================
  // 6602 - 办公费
  // ============================================
  {
    category: ExpenseCategory.OFFICE_SUPPLIES,
    coaCode: '6602.01',
    coaName: '办公费-办公用品',
    coaNameEn: 'Office - Supplies',
    parentCode: '6602',
    description: '文具、纸张等办公用品',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.13,
  },
  {
    category: ExpenseCategory.EQUIPMENT,
    coaCode: '6602.02',
    coaName: '办公费-设备',
    coaNameEn: 'Office - Equipment',
    parentCode: '6602',
    description: '电脑、显示器等设备采购',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.13,
  },
  {
    category: ExpenseCategory.SOFTWARE,
    coaCode: '6602.03',
    coaName: '办公费-软件',
    coaNameEn: 'Office - Software',
    parentCode: '6602',
    description: '软件订阅和许可证',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },

  // ============================================
  // 6603 - 技术费用 (新增)
  // ============================================
  {
    category: ExpenseCategory.AI_TOKEN,
    coaCode: '6603.01',
    coaName: '技术费用-AI服务',
    coaNameEn: 'Tech - AI Services',
    parentCode: '6603',
    description: 'OpenAI、Anthropic、Azure OpenAI 等 AI API 消耗',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.CLOUD_RESOURCE,
    coaCode: '6603.02',
    coaName: '技术费用-云资源',
    coaNameEn: 'Tech - Cloud Resources',
    parentCode: '6603',
    description: 'AWS、GCP、Azure、阿里云等云服务费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.API_SERVICE,
    coaCode: '6603.03',
    coaName: '技术费用-API服务',
    coaNameEn: 'Tech - API Services',
    parentCode: '6603',
    description: '第三方 API 服务费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.HOSTING,
    coaCode: '6603.04',
    coaName: '技术费用-托管服务',
    coaNameEn: 'Tech - Hosting',
    parentCode: '6603',
    description: '服务器托管、CDN 等费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.DOMAIN,
    coaCode: '6603.05',
    coaName: '技术费用-域名',
    coaNameEn: 'Tech - Domain',
    parentCode: '6603',
    description: '域名注册和续费',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },

  // ============================================
  // 6604 - 行政费用 (新增)
  // ============================================
  {
    category: ExpenseCategory.ADMIN_GENERAL,
    coaCode: '6604.01',
    coaName: '行政费用-综合',
    coaNameEn: 'Admin - General',
    parentCode: '6604',
    description: '一般行政费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.COURIER,
    coaCode: '6604.02',
    coaName: '行政费用-快递',
    coaNameEn: 'Admin - Courier',
    parentCode: '6604',
    description: '快递和邮寄费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.PRINTING,
    coaCode: '6604.03',
    coaName: '行政费用-打印复印',
    coaNameEn: 'Admin - Printing',
    parentCode: '6604',
    description: '打印、复印、装订费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.PHONE,
    coaCode: '6604.04',
    coaName: '行政费用-通讯',
    coaNameEn: 'Admin - Phone',
    parentCode: '6604',
    description: '电话费、通讯费',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.INTERNET,
    coaCode: '6604.05',
    coaName: '行政费用-网络',
    coaNameEn: 'Admin - Internet',
    parentCode: '6604',
    description: '网络费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.UTILITIES,
    coaCode: '6604.06',
    coaName: '行政费用-水电',
    coaNameEn: 'Admin - Utilities',
    parentCode: '6604',
    description: '水电费',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.13,
  },

  // ============================================
  // 6605 - 业务费用
  // ============================================
  {
    category: ExpenseCategory.CLIENT_ENTERTAINMENT,
    coaCode: '6605.01',
    coaName: '业务费用-招待',
    coaNameEn: 'Business - Entertainment',
    parentCode: '6605',
    description: '客户招待费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.MARKETING,
    coaCode: '6605.02',
    coaName: '业务费用-市场推广',
    coaNameEn: 'Business - Marketing',
    parentCode: '6605',
    description: '市场推广、广告费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.TRAINING,
    coaCode: '6605.03',
    coaName: '业务费用-培训',
    coaNameEn: 'Business - Training',
    parentCode: '6605',
    description: '培训和学习费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.CONFERENCE,
    coaCode: '6605.04',
    coaName: '业务费用-会议',
    coaNameEn: 'Business - Conference',
    parentCode: '6605',
    description: '会议和活动费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },
  {
    category: ExpenseCategory.MEMBERSHIP,
    coaCode: '6605.05',
    coaName: '业务费用-会员订阅',
    coaNameEn: 'Business - Membership',
    parentCode: '6605',
    description: '协会会员费、专业订阅',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: false,
    defaultTaxRate: 0.06,
  },

  // ============================================
  // 6699 - 其他费用
  // ============================================
  {
    category: ExpenseCategory.OTHER,
    coaCode: '6699.01',
    coaName: '其他费用',
    coaNameEn: 'Other Expenses',
    parentCode: '6699',
    description: '无法归入其他类别的费用',
    isActive: true,
    requiresReceipt: true,
    requiresApproval: true,
    defaultTaxRate: 0.06,
  },
];

/**
 * 获取类别的 COA 映射
 */
export function getCOAMapping(category: ExpenseCategoryType): COAMapping | undefined {
  return DEFAULT_COA_MAPPINGS.find((m) => m.category === category);
}

/**
 * 获取类别的显示名称（中文）
 */
export function getCategoryDisplayName(category: ExpenseCategoryType): string {
  const mapping = getCOAMapping(category);
  return mapping?.coaName.split('-')[1] || category;
}

/**
 * 获取类别的完整显示名称（含父类）
 */
export function getCategoryFullName(category: ExpenseCategoryType): string {
  const mapping = getCOAMapping(category);
  return mapping?.coaName || category;
}

/**
 * 按父类分组的类别
 */
export function getGroupedCategories(): Record<string, COAMapping[]> {
  const groups: Record<string, COAMapping[]> = {};

  for (const mapping of DEFAULT_COA_MAPPINGS) {
    const parentCode = mapping.parentCode || 'other';
    if (!groups[parentCode]) {
      groups[parentCode] = [];
    }
    groups[parentCode].push(mapping);
  }

  return groups;
}

/**
 * COA 父类名称
 */
export const COA_PARENT_NAMES: Record<string, { name: string; nameEn: string }> = {
  '6601': { name: '差旅费', nameEn: 'Travel Expenses' },
  '6602': { name: '办公费', nameEn: 'Office Expenses' },
  '6603': { name: '技术费用', nameEn: 'Technology Expenses' },
  '6604': { name: '行政费用', nameEn: 'Administrative Expenses' },
  '6605': { name: '业务费用', nameEn: 'Business Expenses' },
  '6699': { name: '其他费用', nameEn: 'Other Expenses' },
};
