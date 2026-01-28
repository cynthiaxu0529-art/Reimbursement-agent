/**
 * Fluxa Payout 服务
 * 集成 Fluxa 钱包实现 USDC (Base Chain) 打款功能
 *
 * 工作流程:
 * 1. 使用 agent_id 和 agent_token 刷新 JWT 令牌
 * 2. 调用 payout API 发起付款请求，获得审批 URL
 * 3. 财务人员通过审批 URL 审批付款
 * 4. 通过 GET payout status 查询付款状态
 */

// ============================================================================
// 类型定义
// ============================================================================

export type PayoutStatus =
  | 'pending_authorization'  // 等待财务审批
  | 'authorized'             // 已授权
  | 'signed'                 // 已签名
  | 'broadcasting'           // 广播中
  | 'succeeded'              // 成功
  | 'failed'                 // 失败
  | 'expired';               // 已过期

export interface CreatePayoutRequest {
  payoutId: string;           // 唯一标识，用于幂等性控制
  toAddress: string;          // 目标钱包地址 (0x开头的Base地址)
  amount: string;             // 金额（USDC最小单位，6位小数，如 "1000000" = 1.0 USDC）
  description?: string;       // 描述
  metadata?: Record<string, any>;  // 元数据
  ttlSeconds?: number;        // 过期时间 (60-3600秒)
}

export interface CreatePayoutResponse {
  payoutId: string;
  status: PayoutStatus;
  txHash: string | null;
  approvalUrl: string | null;  // 财务审批URL
  expiresAt: number;           // Unix时间戳
}

export interface PayoutDetails {
  payoutId: string;
  status: PayoutStatus;
  txHash: string | null;
  approvalUrl: string | null;
  expiresAt: number;
  toAddress: string;
  amount: string;
  currency: string;
  network: string;
  assetAddress: string;
  agentId: string;
  agentName: string;
  createdAt: number;
  executedAt: number | null;
}

export interface PayoutStatusResponse {
  payout: PayoutDetails;
}

export interface FluxaPayoutResult {
  success: boolean;
  payoutId?: string;
  status?: PayoutStatus;
  approvalUrl?: string;       // 给财务的审批链接
  txHash?: string;
  expiresAt?: number;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface FluxaPayoutStatusResult {
  success: boolean;
  payout?: PayoutDetails;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// ============================================================================
// 配置常量
// ============================================================================

const USDC_ASSET_ADDRESS = '0x833589fCD6Edb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
const NETWORK = 'base';
const CURRENCY = 'USDC';
const DEFAULT_TTL_SECONDS = 600; // 10分钟

// ============================================================================
// Fluxa Payout 客户端
// ============================================================================

export class FluxaPayoutClient {
  private agentId: string;
  private agentToken: string;
  private walletApiUrl: string;
  private agentIdApiUrl: string;
  private jwtToken: string | null = null;
  private jwtExpiresAt: number = 0;

  constructor() {
    this.agentId = process.env.FLUXA_AGENT_ID || '';
    this.agentToken = process.env.FLUXA_AGENT_TOKEN || '';
    this.walletApiUrl = (process.env.FLUXA_WALLET_API || 'https://walletapi.fluxapay.xyz').replace(/\/+$/, '');
    this.agentIdApiUrl = (process.env.FLUXA_AGENT_ID_API || 'https://agentid.fluxapay.xyz').replace(/\/+$/, '');
  }

  /**
   * 检查配置是否完整
   */
  isConfigured(): boolean {
    return !!(this.agentId && this.agentToken);
  }

  /**
   * 刷新 JWT 令牌
   */
  async refreshJwt(): Promise<string | null> {
    // 如果当前令牌还有效（提前5分钟刷新），直接返回
    if (this.jwtToken && this.jwtExpiresAt > Date.now() + 5 * 60 * 1000) {
      return this.jwtToken;
    }

    try {
      const response = await fetch(`${this.agentIdApiUrl}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          token: this.agentToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fluxa JWT refresh failed:', response.status, errorText);
        return null;
      }

      const data = await response.json();
      this.jwtToken = data.jwt || data.token || data.access_token;

      // 假设 JWT 有效期为1小时
      this.jwtExpiresAt = Date.now() + 60 * 60 * 1000;

      return this.jwtToken;
    } catch (error) {
      console.error('Fluxa JWT refresh error:', error);
      return null;
    }
  }

  /**
   * 创建 Payout（打款请求）
   * 返回审批URL供财务审批
   */
  async createPayout(request: CreatePayoutRequest): Promise<FluxaPayoutResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Fluxa 钱包未配置，请检查环境变量 FLUXA_AGENT_ID 和 FLUXA_AGENT_TOKEN',
        },
      };
    }

    // 刷新 JWT
    const jwt = await this.refreshJwt();
    if (!jwt) {
      return {
        success: false,
        error: {
          code: 'JWT_REFRESH_FAILED',
          message: '无法获取 Fluxa 访问令牌，请检查 agent_id 和 agent_token 配置',
        },
      };
    }

    // 验证钱包地址格式
    if (!this.isValidAddress(request.toAddress)) {
      return {
        success: false,
        error: {
          code: 'INVALID_ADDRESS',
          message: '无效的钱包地址格式，需要0x开头的40位十六进制地址',
        },
      };
    }

    try {
      const response = await fetch(`${this.walletApiUrl}/api/payouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          payoutId: request.payoutId,
          network: NETWORK,
          currency: CURRENCY,
          assetAddress: USDC_ASSET_ADDRESS,
          toAddress: request.toAddress,
          amount: request.amount,
          description: request.description,
          metadata: request.metadata,
          ttlSeconds: request.ttlSeconds || DEFAULT_TTL_SECONDS,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: errorData.code || 'PAYOUT_CREATE_FAILED',
            message: errorData.message || `创建打款请求失败: ${response.status}`,
            details: errorData,
          },
        };
      }

      const data: CreatePayoutResponse = await response.json();

      return {
        success: true,
        payoutId: data.payoutId,
        status: data.status,
        approvalUrl: data.approvalUrl || undefined,
        txHash: data.txHash || undefined,
        expiresAt: data.expiresAt,
      };
    } catch (error) {
      console.error('Fluxa create payout error:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '网络请求失败',
        },
      };
    }
  }

  /**
   * 查询 Payout 状态
   */
  async getPayoutStatus(payoutId: string): Promise<FluxaPayoutStatusResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Fluxa 钱包未配置',
        },
      };
    }

    // 刷新 JWT (查询也需要认证)
    const jwt = await this.refreshJwt();
    if (!jwt) {
      return {
        success: false,
        error: {
          code: 'JWT_REFRESH_FAILED',
          message: '无法获取访问令牌',
        },
      };
    }

    try {
      const response = await fetch(`${this.walletApiUrl}/api/payouts/${payoutId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: errorData.code || 'PAYOUT_QUERY_FAILED',
            message: errorData.message || `查询打款状态失败: ${response.status}`,
            details: errorData,
          },
        };
      }

      const data: PayoutStatusResponse = await response.json();

      return {
        success: true,
        payout: data.payout,
      };
    } catch (error) {
      console.error('Fluxa get payout status error:', error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '网络请求失败',
        },
      };
    }
  }

  /**
   * 验证钱包地址格式 (EVM compatible)
   */
  private isValidAddress(address: string): boolean {
    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return evmAddressRegex.test(address);
  }

  /**
   * 将 USD 金额转换为 USDC 最小单位（6位小数）
   * @param amountUSD USD 金额
   * @returns USDC 最小单位字符串
   */
  static usdToUsdcUnits(amountUSD: number): string {
    // USDC has 6 decimals
    const units = Math.round(amountUSD * 1_000_000);
    return units.toString();
  }

  /**
   * 将 USDC 最小单位转换为 USD 金额
   * @param units USDC 最小单位
   * @returns USD 金额
   */
  static usdcUnitsToUsd(units: string): number {
    return parseInt(units, 10) / 1_000_000;
  }

  /**
   * 检查 Payout 状态是否为终态
   */
  static isTerminalStatus(status: PayoutStatus): boolean {
    return ['succeeded', 'failed', 'expired'].includes(status);
  }

  /**
   * 检查 Payout 是否成功
   */
  static isSuccessStatus(status: PayoutStatus): boolean {
    return status === 'succeeded';
  }

  /**
   * 获取状态的中文描述
   */
  static getStatusDescription(status: PayoutStatus): string {
    const descriptions: Record<PayoutStatus, string> = {
      pending_authorization: '等待财务审批',
      authorized: '已授权，准备签名',
      signed: '已签名，准备广播',
      broadcasting: '交易广播中',
      succeeded: '打款成功',
      failed: '打款失败',
      expired: '已过期',
    };
    return descriptions[status] || status;
  }
}

// ============================================================================
// Fluxa Payout 服务（业务层）
// ============================================================================

export class FluxaPayoutService {
  private client: FluxaPayoutClient;

  constructor(client?: FluxaPayoutClient) {
    this.client = client || new FluxaPayoutClient();
  }

  /**
   * 发起报销打款
   * @param reimbursementId 报销单ID
   * @param toAddress 收款钱包地址
   * @param amountUSD 金额（USD）
   * @param description 描述
   * @param metadata 元数据
   */
  async initiateReimbursementPayout(
    reimbursementId: string,
    toAddress: string,
    amountUSD: number,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<FluxaPayoutResult> {
    // 验证金额
    if (amountUSD <= 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: '打款金额必须大于0',
        },
      };
    }

    // 生成唯一的 payoutId（使用报销单ID + 时间戳避免重复）
    const payoutId = `reimb_${reimbursementId}_${Date.now()}`;

    // 转换金额为 USDC 最小单位
    const amountUnits = FluxaPayoutClient.usdToUsdcUnits(amountUSD);

    return this.client.createPayout({
      payoutId,
      toAddress,
      amount: amountUnits,
      description: description || `报销打款 - ${reimbursementId}`,
      metadata: {
        type: 'reimbursement',
        reimbursementId,
        ...metadata,
      },
      ttlSeconds: 1800, // 30分钟有效期
    });
  }

  /**
   * 查询打款状态
   */
  async checkPayoutStatus(payoutId: string): Promise<FluxaPayoutStatusResult> {
    return this.client.getPayoutStatus(payoutId);
  }

  /**
   * 检查配置
   */
  isConfigured(): boolean {
    return this.client.isConfigured();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createFluxaPayoutClient(): FluxaPayoutClient {
  return new FluxaPayoutClient();
}

export function createFluxaPayoutService(): FluxaPayoutService {
  return new FluxaPayoutService();
}
