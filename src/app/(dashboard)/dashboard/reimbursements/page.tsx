'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// 模拟数据
const reimbursements = [
  {
    id: '1',
    title: '上海出差报销',
    amount: 3895,
    status: 'pending',
    date: '2024-01-18',
    items: 4,
    trip: '上海客户拜访',
  },
  {
    id: '2',
    title: '办公用品采购',
    amount: 560,
    status: 'approved',
    date: '2024-01-15',
    items: 2,
  },
  {
    id: '3',
    title: '客户招待费用',
    amount: 1280,
    status: 'paid',
    date: '2024-01-12',
    items: 1,
  },
  {
    id: '4',
    title: '北京培训差旅',
    amount: 5620,
    status: 'draft',
    date: '2024-01-10',
    items: 6,
    trip: '北京技术培训',
  },
  {
    id: '5',
    title: 'AI API 费用报销',
    amount: 2400,
    status: 'rejected',
    date: '2024-01-08',
    items: 1,
  },
];

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '待审批',
  under_review: '审批中',
  approved: '已批准',
  paid: '已付款',
  rejected: '已拒绝',
};

export default function ReimbursementsPage() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredReimbursements = reimbursements.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">我的报销</h2>
          <p className="text-gray-600">管理和跟踪你的报销申请</p>
        </div>
        <Link href="/dashboard/reimbursements/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建报销
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="搜索报销..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {[
                { value: 'all', label: '全部' },
                { value: 'draft', label: '草稿' },
                { value: 'pending', label: '待审批' },
                { value: 'approved', label: '已批准' },
                { value: 'paid', label: '已付款' },
              ].map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filter === item.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {filteredReimbursements.map((reimbursement) => (
          <Card key={reimbursement.id} className="hover:shadow-md transition">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      href={`/dashboard/reimbursements/${reimbursement.id}`}
                      className="text-lg font-semibold hover:text-blue-600 transition"
                    >
                      {reimbursement.title}
                    </Link>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[reimbursement.status]}`}
                    >
                      {statusLabels[reimbursement.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{reimbursement.date}</span>
                    <span>{reimbursement.items} 项费用</span>
                    {reimbursement.trip && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {reimbursement.trip}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">¥{reimbursement.amount.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredReimbursements.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">没有找到报销记录</p>
              <Link href="/dashboard/reimbursements/new">
                <Button className="mt-4">创建第一个报销</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
