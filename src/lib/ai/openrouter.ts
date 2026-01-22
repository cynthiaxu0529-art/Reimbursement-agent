/**
 * OpenRouter AI Client
 * 通过 OpenRouter 调用各种 AI 模型
 */

import OpenAI from 'openai';
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// ============================================================================
// 配置
// ============================================================================

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// 默认模型 - 可以通过环境变量覆盖
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';

// ============================================================================
// OpenRouter Client
// ============================================================================

export class OpenRouterClient {
  private client: OpenAI | null = null;
  private model: string;

  constructor(model?: string) {
    this.model = model || DEFAULT_MODEL;
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;

    // 支持多种环境变量名
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.openrouter || process.env.OPENROUTER;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    this.client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Reimbursement Portal',
      },
    });

    return this.client;
  }

  /**
   * 发送文本消息
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model: options?.model || this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options?.maxTokens || 2048,
      temperature: options?.temperature || 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from AI');
    }

    return content;
  }

  /**
   * 发送带工具的消息
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions
  ): Promise<ChatWithToolsResponse> {
    const openAITools: ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const openAIMessages: ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.getClient().chat.completions.create({
      model: options?.model || this.model,
      messages: openAIMessages,
      tools: openAITools,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0,
    });

    const choice = response.choices[0];
    const message = choice?.message;

    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })) || [],
      finishReason: choice?.finish_reason || 'stop',
    };
  }

  /**
   * 发送带图片的消息 (Vision)
   */
  async vision(
    imageData: ImageData,
    prompt: string,
    options?: ChatOptions
  ): Promise<string> {
    const imageContent = this.buildImageContent(imageData);

    const response = await this.getClient().chat.completions.create({
      model: options?.model || this.model,
      messages: [
        {
          role: 'user',
          content: [
            imageContent,
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: options?.maxTokens || 2048,
      temperature: options?.temperature || 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from AI');
    }

    return content;
  }

  /**
   * 构建图片内容
   */
  private buildImageContent(imageData: ImageData): OpenAI.ChatCompletionContentPartImage {
    if (imageData.url) {
      return {
        type: 'image_url',
        image_url: {
          url: imageData.url,
        },
      };
    }

    if (imageData.base64) {
      const mimeType = imageData.mimeType || 'image/jpeg';
      return {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${imageData.base64}`,
        },
      };
    }

    throw new Error('Either url or base64 is required for image');
  }
}

// ============================================================================
// 类型定义
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ImageData {
  url?: string;
  base64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatWithToolsResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
}

// ============================================================================
// 单例实例
// ============================================================================

let clientInstance: OpenRouterClient | null = null;

export function getAIClient(): OpenRouterClient {
  if (!clientInstance) {
    clientInstance = new OpenRouterClient();
  }
  return clientInstance;
}
