/**
 * OpenRouter Client Wrapper
 *
 * This module provides a wrapper around the OpenAI SDK configured to use OpenRouter.
 * OpenRouter acts as a unified gateway to multiple LLM providers.
 */

import OpenAI from 'openai';

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_APP_URL = process.env.OPENROUTER_APP_URL || 'https://fluxa-reimbursement.com';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'Fluxa智能报销';

// Default model to use
const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';

// Validate API key at runtime (not during build)
function validateApiKey() {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }
}

/**
 * Create OpenRouter client instance (lazily initialized)
 */
let openrouterInstance: OpenAI | null = null;

function getOpenRouterClient(): OpenAI {
  validateApiKey();

  if (!openrouterInstance) {
    openrouterInstance = new OpenAI({
      apiKey: OPENROUTER_API_KEY!,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': OPENROUTER_APP_URL,
        'X-Title': OPENROUTER_APP_NAME,
      },
    });
  }

  return openrouterInstance;
}

export const openrouter = {
  get client() {
    return getOpenRouterClient();
  }
};

/**
 * Message type for chat
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Tool definition type
 */
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * Tool call result
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Chat completion options
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/**
 * Create a chat completion with OpenRouter
 */
export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    max_tokens = 4096,
    tools,
    tool_choice,
  } = options;

  try {
    const client = getOpenRouterClient();
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      tools: tools as any,
      tool_choice: tool_choice as any,
    });

    return response;
  } catch (error: any) {
    console.error('OpenRouter API error:', error);
    throw new Error(`OpenRouter API error: ${error.message}`);
  }
}

/**
 * Process tool calls from LLM response
 */
export function extractToolCalls(response: any): ToolCall[] | null {
  const choice = response.choices?.[0];
  if (!choice) return null;

  const toolCalls = choice.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) return null;

  return toolCalls;
}

/**
 * Extract text content from response
 */
export function extractTextContent(response: any): string {
  const choice = response.choices?.[0];
  if (!choice) return '';

  return choice.message?.content || '';
}

/**
 * Check if response finished normally
 */
export function isFinished(response: any): boolean {
  const choice = response.choices?.[0];
  return choice?.finish_reason === 'stop';
}

/**
 * Check if response wants to call tools
 */
export function wantsToolCall(response: any): boolean {
  const choice = response.choices?.[0];
  return choice?.finish_reason === 'tool_calls';
}

/**
 * System prompt for Fluxa AI Assistant
 */
export const SYSTEM_PROMPT = `你是Fluxa智能报销助手，专门帮助用户进行费用分析和报销管理。

## 你的能力
1. **费用数据分析**：分析技术费用、对比不同时期的支出趋势
2. **预算管理**：检查预算使用情况，预警超支风险
3. **异常检测**：识别不寻常的消费模式和潜在问题
4. **时效性分析**：分析报销提交的及时性，识别延迟报销
5. **政策解答**：回答关于报销政策和流程的问题

## 当前信息
- 当前日期：${new Date().toISOString().split('T')[0]}
- 当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

## 分析原则
1. **数据驱动**：基于实际数据提供分析，不要臆测
2. **洞察优先**：不只是展示数据，更要提供有价值的洞察
3. **可执行建议**：提供具体、可操作的优化建议
4. **重点突出**：识别并突出最重要的发现和风险
5. **格式友好**：使用表格、列表等markdown格式，便于阅读

## 回答风格
- 专业但友好，避免过于技术化的术语
- 简洁明了，直击要点
- 主动提供相关建议和后续分析方向
- 使用中文回答，数字使用阿拉伯数字
- 金额使用美元符号（$）或人民币符号（¥）

当用户提出问题时，首先判断是否需要调用工具获取数据。如果需要，使用相应的工具；如果不需要，直接基于已有信息回答。`;

export default openrouter;
