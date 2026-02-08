/**
 * AI Connection Test Endpoint
 *
 * 用于测试 OpenRouter 连接和配置
 */

import { NextResponse } from 'next/server';
import { createChatCompletion } from '@/lib/ai/openrouter-client';

export const maxDuration = 30;

/**
 * GET /api/ai/test
 *
 * 测试 OpenRouter 连接
 */
export async function GET() {
  try {
    console.log('[AI Test] Starting connection test...');

    // 环境变量检查
    const envCheck = {
      hasApiKey: !!process.env.OPENROUTER_API_KEY,
      apiKeyLength: process.env.OPENROUTER_API_KEY?.length || 0,
      apiKeyPrefix: process.env.OPENROUTER_API_KEY?.substring(0, 15) + '...' || 'NOT_SET',
      hasVercelUrl: !!process.env.VERCEL_URL,
      vercelUrl: process.env.VERCEL_URL || 'localhost',
      hasAppName: !!process.env.OPENROUTER_APP_NAME,
      appName: process.env.OPENROUTER_APP_NAME || 'Fluxa Reimbursement',
    };

    console.log('[AI Test] Environment check:', envCheck);

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'OPENROUTER_API_KEY not configured',
        envCheck,
      }, { status: 500 });
    }

    // 发送简单的测试请求
    console.log('[AI Test] Sending test request to OpenRouter...');

    const response = await createChatCompletion([
      {
        role: 'user',
        content: 'Hello! Please respond with just "OK" to confirm the connection.'
      }
    ], {
      model: 'anthropic/claude-3.5-sonnet',
      temperature: 0.1,
      max_tokens: 50,
    });

    console.log('[AI Test] Response received:', {
      id: response.id,
      model: response.model,
      choices: response.choices?.length,
    });

    const responseText = response.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      success: true,
      message: 'OpenRouter connection successful!',
      testResponse: responseText,
      envCheck,
      responseDetails: {
        id: response.id,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (error: any) {
    console.error('[AI Test] Error:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      code: error.code,
      status: error.status,
      cause: error.cause,
    });

    return NextResponse.json({
      success: false,
      error: error.message,
      errorType: error.name || error.constructor.name,
      errorDetails: {
        message: error.message,
        code: error.code,
        status: error.status,
        cause: error.cause,
      },
      envCheck: {
        hasApiKey: !!process.env.OPENROUTER_API_KEY,
        apiKeyLength: process.env.OPENROUTER_API_KEY?.length || 0,
        apiKeyPrefix: process.env.OPENROUTER_API_KEY?.substring(0, 15) + '...' || 'NOT_SET',
      },
      troubleshooting: [
        '1. 检查 Vercel 环境变量中的 OPENROUTER_API_KEY',
        '2. 确认 API 密钥格式: sk-or-v1-...',
        '3. 访问 https://openrouter.ai/ 确认账户余额',
        '4. 在 https://openrouter.ai/keys 检查密钥是否有效',
        '5. 确认环境变量设置后已重新部署',
      ],
    }, { status: 500 });
  }
}
