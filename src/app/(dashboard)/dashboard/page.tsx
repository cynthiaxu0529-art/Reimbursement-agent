import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

// 模拟数据
const stats = [
  { label: '待审批', value: 3, color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  { label: '本月报销', value: '¥12,580', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { label: '已完成', value: 15, color: 'text-green-600', bgColor: 'bg-green-50' },
  { label: '进行中行程', value: 1, color: 'text-purple-600', bgColor: 'bg-purple-50' },
];

const recentReimbursements = [
  { id: '1', title: '上海出差报销', amount: 3895, status: 'pending', date: '2024-01-18' },
  { id: '2', title: '办公用品采购', amount: 560, status: 'approved', date: '2024-01-15' },
  { id: '3', title: '客户招待费用', amount: 1280, status: 'paid', date: '2024-01-12' },
];

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '已批准',
  paid: '已付款',
  rejected: '已拒绝',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </div>
                <div className={`w-12 h-12 ${stat.bgColor} rounded-lg`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Reimbursements */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>最近报销</CardTitle>
              <Link
                href="/dashboard/reimbursements"
                className="text-sm text-blue-600 hover:underline"
              >
                查看全部
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentReimbursements.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-gray-500">{item.date}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-medium">¥{item.amount.toLocaleString()}</span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[item.status]}`}
                      >
                        {statusLabels[item.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/dashboard/reimbursements/new"
              className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建报销
            </Link>
            <Link
              href="/dashboard/chat"
              className="flex items-center gap-3 p-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              AI 助手整理报销
            </Link>
            <Link
              href="/dashboard/trips/new"
              className="flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              创建行程
            </Link>
            <Link
              href="/dashboard/receipts/upload"
              className="flex items-center gap-3 p-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              上传票据
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* AI Assistant Prompt */}
      <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">AI 智能助手</h3>
              <p className="text-blue-100 mb-4">
                试试说："帮我整理上周的出差报销" 或 "检查报销材料是否齐全"
              </p>
              <Link
                href="/dashboard/chat"
                className="inline-flex items-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition"
              >
                开始对话
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
            <div className="hidden md:block">
              <svg className="w-24 h-24 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
