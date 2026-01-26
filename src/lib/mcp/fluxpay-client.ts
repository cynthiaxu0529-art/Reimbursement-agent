/**
 * FluxPay MCP 客户端
 * 集成 FluxPay 实现自动打款功能
 */

import type { CurrencyType } from '@/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface PaymentRequest {
  reimbursementId: string;
  userId: string;
  amount: number;
  currency: CurrencyType;
  recipient: PaymentRecipient;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentRecipient {
  name: string;
  // Crypto wallet (Base chain)
  walletAddress: string;
  chain?: string; // default: 'base'
  // Legacy bank account fields (optional)
  bankName?: string;
  accountNumber?: string;
  branchName?: string;
  swiftCode?: string;
  routingNumber?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  status: PaymentStatus;
  message?: string;
  paidAt?: Date;
  fee?: number;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export type PaymentStatus =
  | 'pending'        // 待处理
  | 'processing'     // 处理中
  | 'success'        // 成功
  | 'failed'         // 失败
  | 'cancelled';     // 已取消

export interface PaymentQueryResult {
  transactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: CurrencyType;
  createdAt: Date;
  completedAt?: Date;
  recipient: PaymentRecipient;
}

export interface BatchPaymentRequest {
  payments: PaymentRequest[];
  batchId?: string;
}

export interface BatchPaymentResult {
  batchId: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: PaymentResult[];
}

// ============================================================================
// FluxPay MCP 工具定义
// ============================================================================

export const FLUXPAY_MCP_TOOLS = {
  create_payment: {
    name: 'create_payment',
    description: '创建付款请求，将资金转账给收款人',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: '付款金额',
        },
        currency: {
          type: 'string',
          description: '货币类型 (CNY, USD, EUR 等)',
        },
        recipient_name: {
          type: 'string',
          description: '收款人姓名',
        },
        recipient_bank: {
          type: 'string',
          description: '收款银行名称',
        },
        recipient_account: {
          type: 'string',
          description: '收款账号',
        },
        description: {
          type: 'string',
          description: '付款说明',
        },
        reference_id: {
          type: 'string',
          description: '业务参考ID（如报销单号）',
        },
      },
      required: ['amount', 'currency', 'recipient_name', 'recipient_bank', 'recipient_account'],
    },
  },
  query_payment: {
    name: 'query_payment',
    description: '查询付款状态',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: '交易ID',
        },
      },
      required: ['transaction_id'],
    },
  },
  cancel_payment: {
    name: 'cancel_payment',
    description: '取消待处理的付款',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_id: {
          type: 'string',
          description: '交易ID',
        },
        reason: {
          type: 'string',
          description: '取消原因',
        },
      },
      required: ['transaction_id'],
    },
  },
};

// ============================================================================
// FluxPay 客户端实现
// ============================================================================

export class FluxPayClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.FLUXPAY_API_KEY || '';
    this.baseUrl = baseUrl || process.env.FLUXPAY_ENDPOINT || 'https://api.fluxpay.com';
  }

  /**
   * 创建付款
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Idempotency-Key': request.reimbursementId,
        },
        body: JSON.stringify({
          amount: request.amount,
          currency: request.currency,
          chain: request.recipient.chain || 'base', // FluxPay uses Base chain
          recipient: {
            name: request.recipient.name,
            wallet_address: request.recipient.walletAddress,
            chain: request.recipient.chain || 'base',
          },
          description: request.description,
          reference_id: request.reimbursementId,
          metadata: {
            user_id: request.userId,
            ...request.metadata,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          status: 'failed',
          error: {
            code: error.code || 'PAYMENT_FAILED',
            message: error.message || 'Payment creation failed',
            details: error,
          },
        };
      }

      const data = await response.json();

      return {
        success: true,
        transactionId: data.transaction_id,
        status: data.status as PaymentStatus,
        message: 'Payment created successfully',
        fee: data.fee,
      };
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  /**
   * 查询付款状态
   */
  async queryPayment(transactionId: string): Promise<PaymentQueryResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${transactionId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        transactionId: data.transaction_id,
        status: data.status as PaymentStatus,
        amount: data.amount,
        currency: data.currency,
        createdAt: new Date(data.created_at),
        completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
        recipient: {
          name: data.recipient.name,
          walletAddress: data.recipient.wallet_address || '',
          chain: data.recipient.chain || 'base',
          bankName: data.recipient.bank_name,
          accountNumber: data.recipient.account_number,
        },
      };
    } catch (error) {
      console.error('Query payment error:', error);
      return null;
    }
  }

  /**
   * 取消付款
   */
  async cancelPayment(transactionId: string, reason?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${transactionId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ reason }),
      });

      return response.ok;
    } catch (error) {
      console.error('Cancel payment error:', error);
      return false;
    }
  }

  /**
   * 批量付款
   */
  async createBatchPayment(request: BatchPaymentRequest): Promise<BatchPaymentResult> {
    const results: PaymentResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const payment of request.payments) {
      const result = await this.createPayment(payment);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    return {
      batchId: request.batchId || `batch_${Date.now()}`,
      totalCount: request.payments.length,
      successCount,
      failedCount,
      results,
    };
  }

  /**
   * 设置 Webhook 回调
   */
  async registerWebhook(url: string, events: string[]): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          events,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Register webhook error:', error);
      return false;
    }
  }

  /**
   * 获取钱包余额
   */
  async getBalance(): Promise<{ success: boolean; balance?: number; currency?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: error.message || '获取余额失败',
        };
      }

      const data = await response.json();
      return {
        success: true,
        balance: data.available_balance || data.balance || 0,
        currency: data.currency || 'USD',
      };
    } catch (error) {
      console.error('Get balance error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取余额失败',
      };
    }
  }
}

// ============================================================================
// 付款服务（业务层）
// ============================================================================

export class PaymentService {
  private client: FluxPayClient;

  constructor(client?: FluxPayClient) {
    this.client = client || new FluxPayClient();
  }

  /**
   * 处理报销付款
   */
  async processReimbursementPayment(
    reimbursementId: string,
    userId: string,
    amount: number,
    currency: CurrencyType,
    recipient: PaymentRecipient,
    description?: string
  ): Promise<PaymentResult> {
    // 验证收款信息
    if (!this.validateRecipient(recipient)) {
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'INVALID_RECIPIENT',
          message: '收款人信息不完整或无效',
        },
      };
    }

    // 验证金额
    if (amount <= 0) {
      return {
        success: false,
        status: 'failed',
        error: {
          code: 'INVALID_AMOUNT',
          message: '付款金额必须大于0',
        },
      };
    }

    // 创建付款
    const result = await this.client.createPayment({
      reimbursementId,
      userId,
      amount,
      currency,
      recipient,
      description: description || `报销付款 - ${reimbursementId}`,
      metadata: {
        type: 'reimbursement',
      },
    });

    return result;
  }

  /**
   * 验证收款人信息（钱包地址）
   */
  private validateRecipient(recipient: PaymentRecipient): boolean {
    if (!recipient.name || recipient.name.trim().length === 0) {
      return false;
    }
    // 验证钱包地址格式 (Base chain uses Ethereum-compatible addresses)
    if (!recipient.walletAddress || !this.isValidWalletAddress(recipient.walletAddress)) {
      return false;
    }
    return true;
  }

  /**
   * 验证钱包地址格式 (EVM compatible)
   */
  private isValidWalletAddress(address: string): boolean {
    // Ethereum/Base address format: 0x followed by 40 hex characters
    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return evmAddressRegex.test(address);
  }

  /**
   * 检查付款状态
   */
  async checkPaymentStatus(transactionId: string): Promise<PaymentStatus | null> {
    const result = await this.client.queryPayment(transactionId);
    return result?.status || null;
  }

  /**
   * 重试失败的付款
   */
  async retryPayment(
    reimbursementId: string,
    userId: string,
    amount: number,
    currency: CurrencyType,
    recipient: PaymentRecipient
  ): Promise<PaymentResult> {
    // 重试逻辑，可以添加延迟和最大重试次数
    return this.processReimbursementPayment(
      reimbursementId,
      userId,
      amount,
      currency,
      recipient,
      '报销付款重试'
    );
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

export function createFluxPayClient(): FluxPayClient {
  return new FluxPayClient();
}

export function createPaymentService(): PaymentService {
  return new PaymentService();
}
