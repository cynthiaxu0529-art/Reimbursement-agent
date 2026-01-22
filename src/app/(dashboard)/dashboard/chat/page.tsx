'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: {
    type: string;
    label: string;
    data?: any;
  }[];
}

const samplePrompts = [
  { text: '帮我整理上周的出差报销', icon: '📝' },
  { text: '检查报销材料是否齐全', icon: '✅' },
  { text: '创建一个去上海的出差行程', icon: '✈️' },
  { text: '查看当前预算使用情况', icon: '📊' },
];

const capabilities = [
  { icon: '📧', title: '邮件收集', desc: '自动从邮箱收集差旅确认邮件' },
  { icon: '📷', title: '票据识别', desc: 'AI 识别发票金额、日期、商家' },
  { icon: '✅', title: '合规检查', desc: '检查费用是否符合公司政策' },
  { icon: '💰', title: '预算预估', desc: '出差前预估费用预算' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是你的智能报销助手。我可以帮你：\n\n• 整理和提交报销\n• 收集邮箱中的差旅确认邮件\n• 识别票据信息\n• 检查费用是否符合政策\n• 预估出差预算\n\n有什么我可以帮你的吗？',
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

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 模拟 AI 响应
    setTimeout(() => {
      let response: Message;

      if (messageText.includes('出差') && messageText.includes('报销')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '我来帮你整理出差报销。让我先检查一下相关信息...\n\n已从你的邮箱中找到以下预订确认：\n\n**机票**\n- 1/15 北京→上海 CA1234 ¥1,280\n- 1/17 上海→北京 CA1235 ¥1,350\n\n**酒店**\n- 1/15-1/17 上海某酒店 ¥450/晚 × 2晚 = ¥900\n\n**已识别的票据**\n- 餐饮发票 2张 ¥245\n- 打车发票 1张 ¥120\n\n**合计**: ¥3,895\n\n⚠️ 缺少 1/16 晚餐票据，需要补充吗？',
          timestamp: new Date(),
          actions: [
            { type: 'create_reimbursement', label: '创建报销单' },
            { type: 'add_receipt', label: '补充票据' },
            { type: 'view_details', label: '查看详情' },
          ],
        };
      } else if (messageText.includes('检查') || messageText.includes('齐全')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '我来检查你最近的报销材料...\n\n**上海出差报销** (待提交)\n\n✅ 机票：已有往返电子客票\n✅ 酒店：已有入住确认单\n✅ 餐饮：3张发票已识别\n⚠️ 交通：缺少 1/16 的打车发票\n✅ 其他：无\n\n**建议**：请补充 1/16 的交通费用凭证，或在报销单中说明原因。\n\n需要我帮你查找邮箱中是否有相关的滴滴/高德收据吗？',
          timestamp: new Date(),
          actions: [
            { type: 'search_email', label: '搜索邮箱' },
            { type: 'upload_receipt', label: '手动上传' },
            { type: 'skip', label: '跳过此项' },
          ],
        };
      } else if (messageText.includes('行程') || messageText.includes('上海')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '好的，我来帮你创建去上海的出差行程。请提供以下信息：\n\n1. **出差日期**：什么时候出发和返回？\n2. **出差目的**：客户拜访/会议/培训？\n3. **需要预订**：机票/酒店/用车？\n\n或者你可以直接告诉我，例如：\n"下周一到周三去上海拜访客户，需要订机票和酒店"',
          timestamp: new Date(),
        };
      } else if (messageText.includes('预算') || messageText.includes('花费')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '这是你本月的预算使用情况：\n\n**差旅费用**\n████████░░ ¥12,580 / ¥20,000 (63%)\n\n**技术费用**\n██████░░░░ ¥3,200 / ¥5,000 (64%)\n\n**业务招待**\n██████░░░░ ¥1,800 / ¥3,000 (60%)\n\n**本月统计**\n- 已提交报销：5 笔\n- 已批准金额：¥15,780\n- 待审批金额：¥1,800\n\n整体预算使用率正常，没有超支风险。',
          timestamp: new Date(),
          actions: [
            { type: 'view_details', label: '查看明细' },
            { type: 'export', label: '导出报表' },
          ],
        };
      } else {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '收到！让我来帮你处理这个请求。\n\n你可以尝试更具体的指令，比如：\n- "帮我整理上周上海出差的报销"\n- "检查我的报销材料是否齐全"\n- "创建去北京的出差预算"\n\n我能更好地理解并帮助你。',
          timestamp: new Date(),
        };
      }

      setMessages((prev) => [...prev, response]);
      setIsLoading(false);
    }, 1500);
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
                maxWidth: '75%',
                borderRadius: '1rem',
                padding: '1rem',
                backgroundColor: message.role === 'user' ? '#2563eb' : 'white',
                color: message.role === 'user' ? 'white' : '#111827',
                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                boxShadow: message.role === 'assistant' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message.content}</div>
              {message.actions && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  marginTop: '0.75rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  {message.actions.map((action, index) => (
                    <button
                      key={index}
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {message.role === 'user' && (
              <div style={{
                width: '32px',
                height: '32px',
                backgroundColor: '#2563eb',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '0.75rem',
                flexShrink: 0
              }}>
                <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 500 }}>U</span>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
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
              marginRight: '0.75rem'
            }}>
              <span style={{ color: 'white', fontSize: '0.875rem' }}>🤖</span>
            </div>
            <div style={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '1rem',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#2563eb',
                borderRadius: '50%',
                animation: 'pulse 1s infinite'
              }} />
              <div style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#2563eb',
                borderRadius: '50%',
                animation: 'pulse 1s infinite 0.2s'
              }} />
              <div style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#2563eb',
                borderRadius: '50%',
                animation: 'pulse 1s infinite 0.4s'
              }} />
              <span style={{ color: '#6b7280', fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                思考中...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Capabilities Grid - Show only on first message */}
      {isFirstMessage && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            我能帮你做什么：
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem'
          }}>
            {capabilities.map((cap, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{cap.icon}</div>
                <p style={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  {cap.title}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample Prompts - Show only on first message */}
      {isFirstMessage && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>试试这些：</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {samplePrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => sendMessage(prompt.text)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <span>{prompt.icon}</span> {prompt.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        border: '1px solid #e5e7eb',
        padding: '0.75rem',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            style={{
              padding: '0.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
            title="上传附件"
          >
            <span style={{ fontSize: '1.25rem' }}>📎</span>
          </button>
          <input
            type="text"
            placeholder="输入你的问题或指令..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: 'none',
              outline: 'none',
              fontSize: '1rem',
              backgroundColor: 'transparent'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '0.625rem 1.25rem',
              background: !input.trim() || isLoading
                ? '#9ca3af'
                : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem'
            }}
          >
            发送
            <span>→</span>
          </button>
        </div>
      </div>

      {/* CSS for animation */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
