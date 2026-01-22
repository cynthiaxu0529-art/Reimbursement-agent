'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// 模拟数据
const pendingApprovals = [
  {
    id: '1',
    title: '深圳出差报销',
    submitter: '张三',
    department: '技术部',
    amount: 4560,
    items: 5,
    submittedAt: '2024-01-18 14:30',
    trip: '深圳客户演示',
    complianceStatus: 'passed',
  },
  {
    id: '2',
    title: '云服务费用报销',
    submitter: '李四',
    department: '技术部',
    amount: 8900,
    items: 3,
    submittedAt: '2024-01-17 10:15',
    complianceStatus: 'warning',
    complianceIssue: '云资源费用超出月度预算的 80%',
  },
  {
    id: '3',
    title: '团建活动费用',
    submitter: '王五',
    department: '人力资源',
    amount: 3200,
    items: 2,
    submittedAt: '2024-01-16 16:45',
    complianceStatus: 'passed',
  },
];

const approvalHistory = [
  {
    id: '4',
    title: '上海出差报销',
    submitter: '赵六',
    amount: 3895,
    action: 'approved',
    actionAt: '2024-01-15 11:20',
  },
  {
    id: '5',
    title: '办公用品采购',
    submitter: '张三',
    amount: 560,
    action: 'approved',
    actionAt: '2024-01-14 09:30',
  },
  {
    id: '6',
    title: '超标差旅费用',
    submitter: '李四',
    amount: 12000,
    action: 'rejected',
    actionAt: '2024-01-13 15:00',
    reason: '酒店费用超出政策限额，未提前申请特批',
  },
];

export default function ApprovalsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const handleApprove = (id: string) => {
    console.log('Approve:', id, comment);
    setSelectedId(null);
    setComment('');
  };

  const handleReject = (id: string) => {
    console.log('Reject:', id, comment);
    setSelectedId(null);
    setComment('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">审批管理</h2>
        <p className="text-gray-600">审核团队成员的报销申请</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">待审批</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingApprovals.length}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">本月已审批</p>
                <p className="text-2xl font-bold text-green-600">24</p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">待审批金额</p>
                <p className="text-2xl font-bold text-blue-600">
                  ¥{pendingApprovals.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}
                </p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle>待审批</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="p-4 border rounded-lg hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold">{approval.title}</h4>
                    {approval.complianceStatus === 'warning' && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                        合规警告
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {approval.submitter} · {approval.department}
                    </span>
                    <span>{approval.items} 项费用</span>
                    <span>{approval.submittedAt}</span>
                  </div>
                  {approval.trip && (
                    <p className="text-sm text-gray-500">
                      关联行程：{approval.trip}
                    </p>
                  )}
                  {approval.complianceIssue && (
                    <p className="text-sm text-yellow-600 mt-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {approval.complianceIssue}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold mb-2">¥{approval.amount.toLocaleString()}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedId(selectedId === approval.id ? null : approval.id)}
                    >
                      查看详情
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprove(approval.id)}
                    >
                      批准
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(approval.id)}
                    >
                      拒绝
                    </Button>
                  </div>
                </div>
              </div>

              {/* Expanded Detail */}
              {selectedId === approval.id && (
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500 mb-1">费用明细</p>
                      <ul className="text-sm space-y-1">
                        <li>机票：¥1,280</li>
                        <li>酒店：¥900</li>
                        <li>餐饮：¥380</li>
                        <li>交通：¥200</li>
                      </ul>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-500 mb-1">票据信息</p>
                      <p className="text-sm">已上传 {approval.items} 张票据</p>
                      <p className="text-sm text-green-600">OCR 识别完成</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">审批意见</label>
                    <textarea
                      className="w-full h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      placeholder="输入审批意见（可选）"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {pendingApprovals.length === 0 && (
            <div className="text-center py-8">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500">没有待审批的报销</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>审批历史</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {approvalHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      item.action === 'approved' ? 'bg-green-100' : 'bg-red-100'
                    }`}
                  >
                    {item.action === 'approved' ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-gray-500">
                      {item.submitter} · {item.actionAt}
                    </p>
                    {item.reason && (
                      <p className="text-sm text-red-600">{item.reason}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">¥{item.amount.toLocaleString()}</p>
                  <span
                    className={`text-xs font-medium ${
                      item.action === 'approved' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {item.action === 'approved' ? '已批准' : '已拒绝'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
