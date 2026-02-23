'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const samplePrompts = [
  { text: '报销政策是什么', icon: '📋' },
  { text: '分析本月技术费用', icon: '📊' },
  { text: '预算预警检查', icon: '⚠️' },
  { text: '异常消费检测', icon: '🔍' },
];

const capabilities = [
  { icon: '📋', title: '政策查询', desc: '了解公司报销政策' },
  { icon: '📊', title: '费用分析', desc: '技术费用统计分析' },
  { icon: '⚠️', title: '预算预警', desc: '检测是否接近超支' },
  { icon: '🔍', title: '异常检测', desc: '发现异常消费' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是 Fluxa 智能助手。\n\n我可以帮你：\n• 查询公司报销政策\n• 分析技术费用（SaaS、AI Token、云资源）\n• 提供成本优化建议\n• 检测异常消费\n• 分析报销时效性\n\n试试点击下方的快捷按钮，或直接问我问题。',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 构建会话历史（排除初始欢迎消息）
      const conversationHistory = messages
        .slice(1) // 跳过初始欢迎消息
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      console.log('[Chat] Sending message to AI API:', messageText);

      // 调用 LLM 驱动的 AI Chat API
      const apiResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          conversationHistory,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || 'AI服务请求失败');
      }

      const result = await apiResponse.json();
      console.log('[Chat] Received response from AI:', result);

      if (!result.success || !result.message) {
        throw new Error('AI服务返回无效响应');
      }

      // 创建助手回复消息
      const response: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, response]);
    } catch (error: any) {
      console.error('[Chat] Error:', error);

      // 显示错误消息
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，处理您的请求时出现错误：${error.message}\n\n请稍后重试，或联系管理员。`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isFirstMessage = messages.length === 1;

  return (
    <div style={{
      height: 'calc(100vh - 10rem)',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
          🤖 AI 助手 <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'normal', marginLeft: '0.5rem' }}>Powered by Claude</span>
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>政策查询 · 费用分析 · 优化建议</p>
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        paddingBottom: '1rem',
        paddingRight: '0.5rem'
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '1rem'
            }}
          >
            {message.role === 'assistant' && (
              <div style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '0.75rem',
                flexShrink: 0
              }}>
                <span style={{ color: 'white', fontSize: '0.875rem' }}>🤖</span>
              </div>
            )}
            <div
              style={{
                maxWidth: message.role === 'user' ? '75%' : '85%',
                background: message.role === 'user' ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' : 'white',
                color: message.role === 'user' ? 'white' : '#111827',
                padding: '0.875rem 1rem',
                borderRadius: message.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none'
              }}
            >
              {message.role === 'assistant' ? (
                <div className="markdown-content" style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ fontSize: '0.875rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {message.content}
                </div>
              )}
            </div>
            {message.role === 'user' && (
              <div style={{
                width: '32px',
                height: '32px',
                background: '#f3f4f6',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '0.75rem',
                flexShrink: 0
              }}>
                <span style={{ fontSize: '0.875rem' }}>👤</span>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '0.75rem',
              flexShrink: 0
            }}>
              <span style={{ color: 'white', fontSize: '0.875rem' }}>🤖</span>
            </div>
            <div style={{
              background: 'white',
              padding: '0.875rem 1rem',
              borderRadius: '1rem 1rem 1rem 0.25rem',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="animate-pulse" style={{ fontSize: '0.875rem', color: '#6b7280' }}>正在思考</div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <div className="animate-bounce" style={{ width: '4px', height: '4px', background: '#6b7280', borderRadius: '50%', animationDelay: '0ms' }}></div>
                  <div className="animate-bounce" style={{ width: '4px', height: '4px', background: '#6b7280', borderRadius: '50%', animationDelay: '150ms' }}></div>
                  <div className="animate-bounce" style={{ width: '4px', height: '4px', background: '#6b7280', borderRadius: '50%', animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Capabilities (show only on first message) */}
      {isFirstMessage && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
          padding: '1rem',
          background: '#f9fafb',
          borderRadius: '0.5rem'
        }}>
          {capabilities.map((cap, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.75rem',
                background: 'white',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb'
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{cap.icon}</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.125rem' }}>{cap.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cap.desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sample Prompts */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {samplePrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => sendMessage(prompt.text)}
            disabled={isLoading}
            style={{
              padding: '0.5rem 1rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '1rem',
              fontSize: '0.875rem',
              color: '#374151',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = '#f9fafb';
                e.currentTarget.style.borderColor = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            <span>{prompt.icon}</span>
            <span>{prompt.text}</span>
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '1rem',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '0.75rem',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="输入你的问题... (Shift+Enter换行，Enter发送)"
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            resize: 'none',
            minHeight: '80px',
            maxHeight: '200px',
            fontFamily: 'inherit',
            outline: 'none',
            background: isLoading ? '#f9fafb' : 'white'
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || isLoading}
          style={{
            padding: '0 1.5rem',
            background: (!input.trim() || isLoading) ? '#e5e7eb' : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: (!input.trim() || isLoading) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            alignSelf: 'flex-end'
          }}
        >
          {isLoading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
