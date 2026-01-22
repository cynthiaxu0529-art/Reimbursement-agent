'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const expenseCategories = [
  { value: 'flight', label: '机票', icon: '✈️' },
  { value: 'train', label: '火车票', icon: '🚄' },
  { value: 'hotel', label: '酒店住宿', icon: '🏨' },
  { value: 'meal', label: '餐饮', icon: '🍽️' },
  { value: 'taxi', label: '交通', icon: '🚕' },
  { value: 'office_supplies', label: '办公用品', icon: '📎' },
  { value: 'ai_token', label: 'AI 服务', icon: '🤖' },
  { value: 'cloud_resource', label: '云资源', icon: '☁️' },
  { value: 'client_entertainment', label: '客户招待', icon: '🤝' },
  { value: 'other', label: '其他', icon: '📦' },
];

interface ExpenseItem {
  id: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  location?: string;
  receiptUrl?: string;
}

export default function NewReimbursementPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [tripId, setTripId] = useState('');
  const [items, setItems] = useState<ExpenseItem[]>([
    {
      id: '1',
      category: '',
      description: '',
      amount: '',
      currency: 'CNY',
      date: new Date().toISOString().split('T')[0],
    },
  ]);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        category: '',
        description: '',
        amount: '',
        currency: 'CNY',
        date: new Date().toISOString().split('T')[0],
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof ExpenseItem, value: string) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const handleSubmit = async (isDraft: boolean) => {
    // TODO: 调用 API 保存
    console.log({ title, tripId, items, isDraft });
    router.push('/dashboard/reimbursements');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">新建报销</h2>
        <p className="text-gray-600">填写报销信息并上传票据</p>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">报销标题</label>
            <Input
              placeholder="例如：上海出差报销"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">关联行程（可选）</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
            >
              <option value="">不关联行程</option>
              <option value="trip1">上海客户拜访 (1/15-1/17)</option>
              <option value="trip2">北京技术培训 (1/20-1/22)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Expense Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>费用明细</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加费用
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {items.map((item, index) => (
            <div key={item.id} className="p-4 bg-gray-50 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">费用 #{index + 1}</span>
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">费用类别</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-white px-3 py-1 text-sm"
                    value={item.category}
                    onChange={(e) => updateItem(item.id, 'category', e.target.value)}
                  >
                    <option value="">选择类别</option>
                    {expenseCategories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">金额</label>
                  <div className="flex">
                    <select
                      className="h-9 rounded-l-md border border-r-0 border-input bg-white px-2 text-sm"
                      value={item.currency}
                      onChange={(e) => updateItem(item.id, 'currency', e.target.value)}
                    >
                      <option value="CNY">¥</option>
                      <option value="USD">$</option>
                      <option value="EUR">€</option>
                    </select>
                    <Input
                      type="number"
                      placeholder="0.00"
                      className="rounded-l-none"
                      value={item.amount}
                      onChange={(e) => updateItem(item.id, 'amount', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">日期</label>
                  <Input
                    type="date"
                    value={item.date}
                    onChange={(e) => updateItem(item.id, 'date', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">费用说明</label>
                  <Input
                    placeholder="例如：往返机票"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">消费地点（可选）</label>
                  <Input
                    placeholder="例如：上海"
                    value={item.location || ''}
                    onChange={(e) => updateItem(item.id, 'location', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">上传票据</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-500 transition cursor-pointer">
                  <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm text-gray-500">点击或拖拽上传发票/收据</p>
                  <p className="text-xs text-gray-400 mt-1">支持 JPG, PNG, PDF 格式</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Summary & Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">费用合计</p>
              <p className="text-3xl font-bold">¥{totalAmount.toLocaleString()}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => handleSubmit(true)}>
                保存草稿
              </Button>
              <Button onClick={() => handleSubmit(false)}>
                提交审批
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
