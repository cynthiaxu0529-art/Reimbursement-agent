'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  '帮我整理上周的出差报销',
  '检查报销材料是否齐全',
  '创建一个去上海的出差行程',
  '查看当前预算使用情况',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是你的报销助手。我可以帮你：\n\n• 整理和提交报销\n• 收集邮箱中的差旅确认邮件\n• 识别票据信息\n• 检查费用是否符合政策\n• 预估出差预算\n\n有什么我可以帮你的吗？',
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

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 模拟 AI 响应
    setTimeout(() => {
      let response: Message;

      if (input.includes('出差') && input.includes('报销')) {
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
      } else if (input.includes('政策') || input.includes('创建')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '好的，我来帮你创建报销政策。请告诉我：\n\n1. **差旅费用限额**（如机票、酒店、餐饮）\n2. **需要审批的金额阈值**\n3. **特殊规则**（如一线城市酒店限额不同）\n\n或者你可以直接说类似："机票最高2000元，一线城市酒店800元/晚，其他城市500元/晚"',
          timestamp: new Date(),
        };
      } else if (input.includes('预算') || input.includes('花费')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '这是你本月的预算使用情况：\n\n**差旅费用** ¥12,580 / ¥20,000\n████████░░ 63%\n\n**技术费用** ¥3,200 / ¥5,000\n██████░░░░ 64%\n\n**业务费用** ¥1,800 / ¥3,000\n██████░░░░ 60%\n\n整体预算使用率正常，没有超支风险。',
          timestamp: new Date(),
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

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.actions && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                  {message.actions.map((action, index) => (
                    <Button
                      key={index}
                      size="sm"
                      variant="outline"
                      className="bg-white"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm rounded-lg p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sample Prompts */}
      {messages.length === 1 && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">试试这些：</p>
          <div className="flex flex-wrap gap-2">
            {samplePrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => setInput(prompt)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <Input
              className="flex-1"
              placeholder="输入你的问题或指令..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <Button onClick={sendMessage} disabled={!input.trim() || isLoading}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
