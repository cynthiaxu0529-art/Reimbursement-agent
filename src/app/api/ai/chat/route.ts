/**
 * AI Chat API
 *
 * Handles chat requests with the LLM-powered AI assistant.
 * Supports function calling for data retrieval and analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  createChatCompletion,
  extractToolCalls,
  extractTextContent,
  wantsToolCall,
  ChatMessage,
  SYSTEM_PROMPT,
} from '@/lib/ai/openrouter-client';
import { allTools } from '@/lib/ai/tools';
import { executeTool } from '@/lib/ai/tool-executor';

export const maxDuration = 60; // Allow up to 60 seconds for LLM processing

/**
 * POST /api/ai/chat
 *
 * Request body:
 * {
 *   message: string;           // User's message
 *   conversationHistory?: ChatMessage[];  // Previous messages (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 2. Get user and tenant info
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: '未关联公司' }, { status: 404 });
    }

    // 3. Parse request body
    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: '消息内容无效' }, { status: 400 });
    }

    console.log('[AI Chat] User message:', message);
    console.log('[AI Chat] Conversation history length:', conversationHistory.length);

    // 4. Build messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    // 5. First LLM call - understand intent and decide tool usage
    console.log('[AI Chat] Calling LLM...');
    let response = await createChatCompletion(messages, {
      tools: allTools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 4096,
    });

    // 6. Handle tool calls if LLM wants to use tools
    if (wantsToolCall(response)) {
      console.log('[AI Chat] LLM wants to call tools');
      const toolCalls = extractToolCalls(response);

      if (toolCalls && toolCalls.length > 0) {
        // Execute all tool calls
        const toolResults = [];
        for (const toolCall of toolCalls) {
          console.log('[AI Chat] Executing tool:', toolCall.function.name);

          let params;
          try {
            params = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            console.error('[AI Chat] Failed to parse tool arguments:', e);
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolCall.function.name,
              content: JSON.stringify({
                success: false,
                error: '参数解析失败',
              }),
            });
            continue;
          }

          // Execute the tool
          // 构建完整的 base URL（服务器端必须使用完整 URL）
          const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXTAUTH_URL || 'http://localhost:3000';

          const result = await executeTool(toolCall.function.name, params, {
            userId: session.user.id,
            tenantId: user.tenantId,
            baseUrl,
          });

          console.log('[AI Chat] Tool result:', {
            tool: toolCall.function.name,
            success: result.success,
          });

          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: toolCall.function.name,
            content: JSON.stringify(result),
          });
        }

        // 7. Second LLM call - analyze tool results and generate response
        console.log('[AI Chat] Calling LLM with tool results...');
        const messagesWithTools: any[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...conversationHistory,
          { role: 'user', content: message },
          {
            role: 'assistant',
            content: null,
            tool_calls: toolCalls,
          },
          ...toolResults,
        ];

        response = await createChatCompletion(messagesWithTools, {
          temperature: 0.7,
          max_tokens: 4096,
        });
      }
    }

    // 8. Extract final response text
    const responseText = extractTextContent(response);

    console.log('[AI Chat] Final response length:', responseText.length);

    // 9. Return response
    return NextResponse.json({
      success: true,
      message: responseText,
      model: response.model,
      usage: response.usage,
    });
  } catch (error: any) {
    // 详细的错误日志 - 包含所有可能的错误信息
    console.error('[AI Chat] Detailed error information:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      cause: error.cause,
      code: error.code,
      status: error.status,
      // 环境变量检查（不输出实际值，只检查是否存在）
      envCheck: {
        hasApiKey: !!process.env.OPENROUTER_API_KEY,
        apiKeyLength: process.env.OPENROUTER_API_KEY?.length,
        apiKeyPrefix: process.env.OPENROUTER_API_KEY?.substring(0, 10),
        hasVercelUrl: !!process.env.VERCEL_URL,
        vercelUrl: process.env.VERCEL_URL,
      },
    });

    // Handle specific OpenRouter errors
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        {
          error: 'AI服务配置错误，请检查API密钥',
          details: error.message,
          troubleshooting: '请确认 Vercel 环境变量 OPENROUTER_API_KEY 已正确配置'
        },
        { status: 500 }
      );
    }

    if (error.message?.includes('rate limit')) {
      return NextResponse.json(
        {
          error: 'AI服务请求过于频繁，请稍后再试',
          details: error.message,
        },
        { status: 429 }
      );
    }

    // 返回详细的错误信息给前端
    return NextResponse.json(
      {
        error: `AI服务错误: ${error.message}`,
        errorType: error.name || error.constructor.name,
        details: {
          message: error.message,
          code: error.code,
          status: error.status,
        },
        troubleshooting: [
          '1. 检查 OpenRouter API 密钥是否正确',
          '2. 确认 OpenRouter 账户余额充足',
          '3. 查看 Vercel Function 日志获取详细信息',
        ],
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/chat
 *
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Fluxa AI Chat',
    version: '1.0.0',
    model: 'anthropic/claude-3.5-sonnet',
  });
}
