'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: {
    name: string;
    type: string;
    url?: string;
  }[];
  actions?: {
    type: string;
    label: string;
    href?: string;
    data?: any;
  }[];
  ocrResult?: OCRResult;
}

interface OCRResult {
  type: string;
  vendor?: string;
  amount?: number;
  currency?: string;
  date?: string;
  invoiceNumber?: string;
  category?: string;
  confidence: number;
  rawText?: string;
}

const receiptTypeLabels: Record<string, string> = {
  'vat_invoice': '增值税普通发票',
  'vat_special': '增值税专用发票',
  'flight_itinerary': '机票行程单',
  'train_ticket': '火车票',
  'hotel_receipt': '酒店发票',
  'taxi_receipt': '出租车发票',
  'ride_hailing': '网约车发票',
  'restaurant': '餐饮发票',
  'general_receipt': '通用收据',
  'unknown': '未知类型',
};

const categoryLabels: Record<string, string> = {
  'flight': '机票',
  'train': '火车票',
  'hotel': '酒店住宿',
  'meal': '餐饮',
  'taxi': '交通',
  'other': '其他',
};

const samplePrompts = [
  { text: '帮我创建一笔报销', icon: '📝' },
  { text: '检查报销材料是否齐全', icon: '✅' },
  { text: '查看当前预算使用情况', icon: '📊' },
  { text: '报销政策是什么', icon: '📋' },
];

const capabilities = [
  { icon: '📷', title: '票据识别', desc: '上传发票自动识别信息' },
  { icon: '📝', title: '快速报销', desc: '对话式创建报销单' },
  { icon: '✅', title: '合规检查', desc: '检查费用是否符合政策' },
  { icon: '💰', title: '预算查询', desc: '查看部门预算使用情况' },
];

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是 Fluxa 智能报销助手。\n\n我可以帮你：\n• 上传票据并自动识别信息\n• 快速创建报销单\n• 检查费用是否符合公司政策\n• 查询预算使用情况\n\n你可以直接上传发票图片，或告诉我你想做什么。',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [lastOCRResult, setLastOCRResult] = useState<OCRResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 将文件转换为 base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // 移除 data:image/xxx;base64, 前缀
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // 调用 OCR API
  const callOCRAPI = async (file: File): Promise<OCRResult> => {
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: mimeType,
        }),
      });

      const result = await response.json();

      if (result.success && result.data) {
        return {
          type: result.data.type || 'unknown',
          vendor: result.data.vendor,
          amount: result.data.amount,
          currency: result.data.currency || 'CNY',
          date: result.data.date ? new Date(result.data.date).toLocaleDateString('zh-CN') : undefined,
          invoiceNumber: result.data.invoiceNumber,
          category: result.data.category,
          confidence: result.data.confidence || 0,
          rawText: result.data.rawText,
        };
      } else {
        throw new Error(result.error || 'OCR 识别失败');
      }
    } catch (error) {
      console.error('OCR error:', error);
      throw error;
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if ((!messageText.trim() && uploadedFiles.length === 0) || isLoading) return;

    const attachments = uploadedFiles.map(file => ({
      name: file.name,
      type: file.type,
    }));

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText || (uploadedFiles.length > 0 ? `上传了 ${uploadedFiles.length} 个文件` : ''),
      timestamp: new Date(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    const filesToProcess = [...uploadedFiles];
    setUploadedFiles([]);
    setIsLoading(true);

    try {
      let response: Message;

      if (filesToProcess.length > 0) {
        // 处理上传的文件 - 调用真正的 OCR API
        const file = filesToProcess[0]; // 先处理第一个文件

        try {
          const ocrResult = await callOCRAPI(file);
          setLastOCRResult(ocrResult);

          const typeLabel = receiptTypeLabels[ocrResult.type] || ocrResult.type;
          const categoryLabel = ocrResult.category ? (categoryLabels[ocrResult.category] || ocrResult.category) : '待分类';
          const confidencePercent = Math.round(ocrResult.confidence * 100);

          response = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `我已识别到你上传的票据！\n\n**识别结果：**\n\n• **类型**：${typeLabel}\n• **商家**：${ocrResult.vendor || '未识别'}\n• **金额**：${ocrResult.amount ? `¥${ocrResult.amount.toLocaleString()}` : '未识别'}\n• **日期**：${ocrResult.date || '未识别'}\n• **发票号**：${ocrResult.invoiceNumber || '未识别'}\n• **费用类别**：${categoryLabel}\n• **识别置信度**：${confidencePercent}%\n\n确认信息无误后，你可以创建报销单。`,
            timestamp: new Date(),
            ocrResult: ocrResult,
            actions: [
              { type: 'create_with_data', label: '创建报销单', href: '/dashboard/reimbursements/new', data: ocrResult },
              { type: 'upload_more', label: '继续上传' },
              { type: 'cancel', label: '取消' },
            ],
          };
        } catch (error) {
          response = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `抱歉，票据识别遇到问题。\n\n**错误信息**：${error instanceof Error ? error.message : '未知错误'}\n\n可能的原因：\n• 图片不够清晰\n• 票据格式不支持\n• 服务暂时不可用\n\n请尝试重新上传更清晰的图片，或手动创建报销单。`,
            timestamp: new Date(),
            actions: [
              { type: 'upload_more', label: '重新上传' },
              { type: 'manual', label: '手动填写', href: '/dashboard/reimbursements/new' },
            ],
          };
        }
      } else if (messageText.includes('创建') || messageText.includes('报销')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '好的，我来帮你创建报销单。\n\n你可以：\n1. **上传票据** - 我会自动识别发票信息\n2. **手动填写** - 前往报销表单页面\n\n请选择你想要的方式：',
          timestamp: new Date(),
          actions: [
            { type: 'upload', label: '上传票据' },
            { type: 'manual', label: '手动填写', href: '/dashboard/reimbursements/new' },
          ],
        };
      } else if (messageText.includes('检查') || messageText.includes('齐全')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '让我检查一下你的报销材料...\n\n**检查结果：**\n\n目前没有待提交的报销草稿。\n\n你可以：\n• 创建新的报销单\n• 上传票据开始报销流程',
          timestamp: new Date(),
          actions: [
            { type: 'create', label: '创建报销单', href: '/dashboard/reimbursements/new' },
          ],
        };
      } else if (messageText.includes('预算') || messageText.includes('花费')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '**Fluxa 本月预算使用情况：**\n\n请联系管理员设置部门预算后，我可以帮你查询详细的预算使用情况。\n\n你也可以在「设置」中配置预算限额。',
          timestamp: new Date(),
          actions: [
            { type: 'settings', label: '前往设置', href: '/dashboard/settings' },
          ],
        };
      } else if (messageText.includes('政策')) {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '**Fluxa 报销政策：**\n\n请管理员在「设置 → 报销政策」中配置公司的报销政策。\n\n配置后，我可以帮你自动检查费用是否符合政策。',
          timestamp: new Date(),
          actions: [
            { type: 'settings', label: '配置政策', href: '/dashboard/settings' },
          ],
        };
      } else {
        response = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '我理解你的需求。你可以尝试：\n\n• **上传票据** - 点击下方📎按钮上传发票\n• **创建报销** - 说"帮我创建一笔报销"\n• **查看预算** - 说"查看预算使用情况"\n\n有什么我可以帮你的？',
          timestamp: new Date(),
        };
      }

      setMessages((prev) => [...prev, response]);
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

  const handleActionClick = (action: { type: string; label: string; href?: string; data?: any }) => {
    if (action.href) {
      // 如果有 OCR 数据，将其存储到 sessionStorage 供报销页面使用
      if (action.data || lastOCRResult) {
        const dataToStore = action.data || lastOCRResult;
        sessionStorage.setItem('ocrData', JSON.stringify(dataToStore));
      }
      router.push(action.href);
    } else if (action.type === 'upload' || action.type === 'upload_more') {
      fileInputRef.current?.click();
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
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>AI 助手</h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>智能报销助手，支持票据识别和快速报销</p>
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
                maxWidth: '75%',
                borderRadius: '1rem',
                padding: '1rem',
                backgroundColor: message.role === 'user' ? '#2563eb' : 'white',
                color: message.role === 'user' ? 'white' : '#111827',
                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                boxShadow: message.role === 'assistant' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  {message.attachments.map((att, idx) => (
                    <div key={idx} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: message.role === 'user' ? 'rgba(255,255,255,0.2)' : '#f3f4f6',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      marginRight: '0.25rem'
                    }}>
                      📎 {att.name}
                    </div>
                  ))}
                </div>
              )}
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
                      onClick={() => handleActionClick(action)}
                      style={{
                        padding: '0.375rem 0.75rem',
                        backgroundColor: action.type === 'create' || action.type === 'manual' || action.type === 'create_with_data' ? '#2563eb' : '#eff6ff',
                        color: action.type === 'create' || action.type === 'manual' || action.type === 'create_with_data' ? 'white' : '#2563eb',
                        border: action.type === 'create' || action.type === 'manual' || action.type === 'create_with_data' ? 'none' : '1px solid #bfdbfe',
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
                <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 500 }}>F</span>
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
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                正在识别票据，请稍候...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Capabilities Grid - Show only on first message */}
      {isFirstMessage && (
        <div style={{ marginBottom: '1rem' }}>
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

      {/* Uploaded Files Preview */}
      {uploadedFiles.length > 0 && (
        <div style={{
          marginBottom: '0.5rem',
          padding: '0.75rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            待上传文件：
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {uploadedFiles.map((file, index) => (
              <div key={index} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0.75rem',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}>
                <span>📄</span>
                <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </span>
                <button
                  onClick={() => removeFile(index)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '0',
                    fontSize: '1rem'
                  }}
                >
                  ×
                </button>
              </div>
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*,.pdf"
          multiple
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '0.5rem',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.875rem'
            }}
            title="上传票据"
          >
            <span style={{ fontSize: '1.25rem' }}>📎</span>
            <span>上传票据</span>
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
            disabled={(!input.trim() && uploadedFiles.length === 0) || isLoading}
            style={{
              padding: '0.625rem 1.25rem',
              background: (!input.trim() && uploadedFiles.length === 0) || isLoading
                ? '#9ca3af'
                : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 500,
              cursor: (!input.trim() && uploadedFiles.length === 0) || isLoading ? 'not-allowed' : 'pointer',
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
    </div>
  );
}
