'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { UserRole } from '@/types';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  availableRoles: string[];
}

interface DashboardStats {
  // 员工统计
  myTotal: number;
  myPending: number;
  myApproved: number;
  myPaid: number;
  myTotalAmount: number;
  // 审批人统计
  pendingApproval: number;
  approvedThisMonth: number;
  // 管理员统计
  teamMembers: number;
  monthlyTotal: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    myTotal: 0,
    myPending: 0,
    myApproved: 0,
    myPaid: 0,
    myTotalAmount: 0,
    pendingApproval: 0,
    approvedThisMonth: 0,
    teamMembers: 1,
    monthlyTotal: 0,
  });
  const [recentReimbursements, setRecentReimbursements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 获取用户信息
        const userRes = await fetch('/api/auth/me');
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData.data);
        }

        // 获取报销统计
        const reimbursementsRes = await fetch('/api/reimbursements?limit=5');
        if (reimbursementsRes.ok) {
          const reimbursementsData = await reimbursementsRes.json();
          const items = reimbursementsData.data || [];
          setRecentReimbursements(items.slice(0, 5));

          // 计算统计数据
          const myPending = items.filter((r: any) => r.status === 'pending' || r.status === 'submitted').length;
          const myApproved = items.filter((r: any) => r.status === 'approved').length;
          const myPaid = items.filter((r: any) => r.status === 'paid').length;
          const myTotalAmount = items.reduce((sum: number, r: any) => sum + (r.totalAmount || 0), 0);

          setStats(prev => ({
            ...prev,
            myTotal: items.length,
            myPending,
            myApproved,
            myPaid,
            myTotalAmount,
          }));
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const isEmployee = user?.role === UserRole.EMPLOYEE;
  const isManager = user?.role === UserRole.MANAGER;
  const isFinance = user?.role === UserRole.FINANCE;
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const canApprove = isManager || isFinance || isAdmin;

  // 根据角色显示不同的欢迎语
  const getWelcomeMessage = () => {
    if (isAdmin) {
      return {
        title: `${user?.name || '管理员'}，欢迎回来`,
        subtitle: '管理团队成员、设置报销政策，掌控报销全流程',
      };
    }
    if (isFinance) {
      return {
        title: `${user?.name || '财务'}，欢迎回来`,
        subtitle: '审批报销申请、处理打款，确保资金流转顺畅',
      };
    }
    if (isManager) {
      return {
        title: `${user?.name || '经理'}，欢迎回来`,
        subtitle: '审批团队报销，同时也可以提交自己的报销',
      };
    }
    return {
      title: `${user?.name || ''}，欢迎回来`,
      subtitle: '轻松提交报销，实时追踪进度',
    };
  };

  const welcome = getWelcomeMessage();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string; bg: string }> = {
      draft: { text: '草稿', color: '#6b7280', bg: '#f3f4f6' },
      pending: { text: '待审批', color: '#d97706', bg: '#fef3c7' },
      submitted: { text: '已提交', color: '#2563eb', bg: '#dbeafe' },
      approved: { text: '已批准', color: '#16a34a', bg: '#dcfce7' },
      rejected: { text: '已拒绝', color: '#dc2626', bg: '#fee2e2' },
      paid: { text: '已打款', color: '#059669', bg: '#d1fae5' },
    };
    return labels[status] || { text: status, color: '#6b7280', bg: '#f3f4f6' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 欢迎横幅 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">{welcome.title}</h1>
        <p className="text-blue-100 text-sm">{welcome.subtitle}</p>
      </div>

      {/* 统计卡片 - 根据角色显示不同内容 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 员工始终看到自己的报销统计 */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">我的报销</p>
              <p className="text-2xl font-bold text-gray-900">{stats.myTotal}</p>
              <p className="text-xs text-gray-400 mt-1">共 {stats.myTotal} 笔</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <span className="text-2xl">📋</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">审批中</p>
              <p className="text-2xl font-bold text-amber-600">{stats.myPending}</p>
              <p className="text-xs text-gray-400 mt-1">等待审批</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <span className="text-2xl">⏳</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">已批准</p>
              <p className="text-2xl font-bold text-green-600">{stats.myApproved}</p>
              <p className="text-xs text-gray-400 mt-1">待打款</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">累计金额</p>
              <p className="text-2xl font-bold text-indigo-600">{formatAmount(stats.myTotalAmount)}</p>
              <p className="text-xs text-gray-400 mt-1">已打款 {stats.myPaid} 笔</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 审批人额外看到待审批统计 */}
      {canApprove && (
        <Card className="p-4 border-2 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center">
                <span className="text-2xl">📥</span>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-800">待我审批</p>
                <p className="text-3xl font-bold text-amber-900">{stats.pendingApproval}</p>
              </div>
            </div>
            <Link
              href="/dashboard/approvals"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              去审批 →
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 快捷操作 */}
        <Card className="lg:col-span-1">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">快捷操作</h2>
          </div>
          <div className="p-4 space-y-2">
            <Link
              href="/dashboard/reimbursements/new"
              className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
            >
              <span className="text-xl">📝</span>
              <div>
                <p className="font-medium">新建报销</p>
                <p className="text-xs text-blue-500">创建新的报销申请</p>
              </div>
            </Link>

            <Link
              href="/dashboard/chat"
              className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors"
            >
              <span className="text-xl">🤖</span>
              <div>
                <p className="font-medium">AI 助手</p>
                <p className="text-xs text-purple-500">拍照上传票据，自动识别</p>
              </div>
            </Link>

            <Link
              href="/dashboard/reimbursements"
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <span className="text-xl">📊</span>
              <div>
                <p className="font-medium">我的报销</p>
                <p className="text-xs text-gray-500">查看所有报销记录</p>
              </div>
            </Link>

            {canApprove && (
              <Link
                href="/dashboard/approvals"
                className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors"
              >
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-medium">审批报销</p>
                  <p className="text-xs text-amber-500">处理待审批的申请</p>
                </div>
              </Link>
            )}

            {isAdmin && (
              <>
                <Link
                  href="/dashboard/team"
                  className="flex items-center gap-3 p-3 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                >
                  <span className="text-xl">👥</span>
                  <div>
                    <p className="font-medium">团队管理</p>
                    <p className="text-xs text-green-500">邀请成员、管理权限</p>
                  </div>
                </Link>

                <Link
                  href="/dashboard/settings"
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
                >
                  <span className="text-xl">⚙️</span>
                  <div>
                    <p className="font-medium">系统设置</p>
                    <p className="text-xs text-slate-500">配置报销政策和规则</p>
                  </div>
                </Link>
              </>
            )}
          </div>
        </Card>

        {/* 最近报销 */}
        <Card className="lg:col-span-2">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">最近报销</h2>
            <Link href="/dashboard/reimbursements" className="text-sm text-blue-600 hover:text-blue-700">
              查看全部 →
            </Link>
          </div>
          <div className="divide-y">
            {recentReimbursements.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-3xl">📭</span>
                </div>
                <p className="text-gray-500 mb-4">还没有报销记录</p>
                <Link
                  href="/dashboard/reimbursements/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <span>📝</span> 创建第一笔报销
                </Link>
              </div>
            ) : (
              recentReimbursements.map((item) => {
                const status = getStatusLabel(item.status);
                return (
                  <Link
                    key={item.id}
                    href={`/dashboard/reimbursements/${item.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <span className="text-lg">🧾</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{item.title || '报销单'}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{formatAmount(item.totalAmount || 0)}</p>
                      <span
                        className="inline-block text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: status.bg, color: status.color }}
                      >
                        {status.text}
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* 管理员看到的新手引导 */}
      {isAdmin && stats.myTotal === 0 && (
        <Card className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-2 border-blue-100">
          <h3 className="font-semibold text-gray-900 mb-4">🚀 开始使用</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-sm font-medium">
                ✓
              </div>
              <span className="text-sm text-gray-600">创建公司账号</span>
            </div>
            <Link href="/dashboard/team" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-medium">
                2
              </div>
              <span className="text-sm text-blue-600 group-hover:underline">邀请团队成员 →</span>
            </Link>
            <Link href="/dashboard/settings" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
                3
              </div>
              <span className="text-sm text-gray-500 group-hover:text-gray-700">设置报销政策</span>
            </Link>
            <Link href="/dashboard/reimbursements/new" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-medium">
                4
              </div>
              <span className="text-sm text-gray-500 group-hover:text-gray-700">提交第一笔报销</span>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
