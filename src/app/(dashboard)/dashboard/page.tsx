'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { UserRole } from '@/types';
import { CURRENCY_SYMBOLS } from '@/lib/constants/reimbursement';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  availableRoles: string[];
}

interface Reimbursement {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  totalAmountInBaseCurrency?: number;
  baseCurrency?: string;
  createdAt: string;
  submitter?: {
    name: string;
    email: string;
    department?: string;
  };
}

interface DashboardStats {
  baseCurrency: string;
  // 员工统计
  myTotal: number;
  myPending: number;
  myApproved: number;
  myProcessing: number;
  myPaid: number;
  myRejected: number;
  myTotalAmount: number;
  // 审批人统计
  pendingApproval: number;
  pendingApprovalAmount: number;
  // 管理员统计
  teamMembers: number;
  companyTotal: number;
  companyPending: number;
  companyApproved: number;
  companyProcessing: number;
  companyPaid: number;
  companyTotalAmount: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    baseCurrency: 'USD',
    myTotal: 0,
    myPending: 0,
    myApproved: 0,
    myProcessing: 0,
    myPaid: 0,
    myRejected: 0,
    myTotalAmount: 0,
    pendingApproval: 0,
    pendingApprovalAmount: 0,
    teamMembers: 0,
    companyTotal: 0,
    companyPending: 0,
    companyApproved: 0,
    companyProcessing: 0,
    companyPaid: 0,
    companyTotalAmount: 0,
  });
  const [recentReimbursements, setRecentReimbursements] = useState<Reimbursement[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. 获取用户信息
        const userRes = await fetch('/api/auth/me');
        let userData: UserInfo | null = null;
        if (userRes.ok) {
          const userJson = await userRes.json();
          userData = userJson.data;
          setUser(userData);
        }

        const userRole = userData?.role;
        const canApproveRole = userRole === UserRole.MANAGER ||
                               userRole === UserRole.FINANCE ||
                               userRole === UserRole.ADMIN ||
                               userRole === UserRole.SUPER_ADMIN;
        const isAdminRole = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

        // 2. 使用后端聚合统计 API（避免 pageSize 截断）
        const statsRole = isAdminRole ? 'admin' : canApproveRole ? 'approver' : 'employee';
        const statsRes = await fetch(`/api/reimbursements/stats?role=${statsRole}`);
        if (statsRes.ok) {
          const statsJson = await statsRes.json();
          if (statsJson.success && statsJson.stats) {
            setStats(prev => ({ ...prev, ...statsJson.stats }));
          }
        }

        // 3. 获取最近5笔报销用于列表展示
        const myReimbursementsRes = await fetch('/api/reimbursements?pageSize=5');
        if (myReimbursementsRes.ok) {
          const myData = await myReimbursementsRes.json();
          setRecentReimbursements(myData.data || []);
        }

        // 4. 如果是审批人，获取待审批列表（展示用，最多5条）
        if (canApproveRole) {
          try {
            const approvalRes = await fetch('/api/reimbursements?role=approver&status=pending,under_review&pageSize=5');
            if (approvalRes.ok) {
              const approvalData = await approvalRes.json();
              setPendingApprovals(approvalData.data || []);
            }
          } catch (e) {
            console.error('Failed to fetch pending approvals:', e);
          }
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

  const getWelcomeMessage = () => {
    const name = user?.name || '';
    if (isAdmin) {
      return {
        title: `${name}，欢迎回来`,
        subtitle: '管理团队成员、设置报销政策，掌控报销全流程',
      };
    }
    if (isFinance) {
      return {
        title: `${name}，欢迎回来`,
        subtitle: '审批报销申请、处理打款，确保资金流转顺畅',
      };
    }
    if (isManager) {
      return {
        title: `${name}，欢迎回来`,
        subtitle: '审批团队报销，同时也可以提交自己的报销',
      };
    }
    return {
      title: `${name}，欢迎回来`,
      subtitle: '轻松提交报销，实时追踪进度',
    };
  };

  const welcome = getWelcomeMessage();

  const currencySymbol = CURRENCY_SYMBOLS[stats.baseCurrency] || '$';

  const formatAmount = (amount: number) => {
    return `${currencySymbol}${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)}`;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string; bg: string }> = {
      draft: { text: '草稿', color: '#6b7280', bg: '#f3f4f6' },
      pending: { text: '待审批', color: '#d97706', bg: '#fef3c7' },
      under_review: { text: '审核中', color: '#2563eb', bg: '#dbeafe' },
      approved: { text: '已批准', color: '#16a34a', bg: '#dcfce7' },
      rejected: { text: '已拒绝', color: '#dc2626', bg: '#fee2e2' },
      processing: { text: '处理中', color: '#2563eb', bg: '#dbeafe' },
      paid: { text: '已打款', color: '#059669', bg: '#d1fae5' },
    };
    return labels[status] || { text: status, color: '#6b7280', bg: '#f3f4f6' };
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { text: string; color: string }> = {
      employee: { text: '员工', color: '#6b7280' },
      manager: { text: '经理', color: '#2563eb' },
      finance: { text: '财务', color: '#059669' },
      admin: { text: '管理员', color: '#7c3aed' },
      super_admin: { text: '超级管理员', color: '#dc2626' },
    };
    return badges[role] || { text: role, color: '#6b7280' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  const roleBadge = getRoleBadge(user?.role || 'employee');

  return (
    <div className="space-y-6">
      {/* 欢迎横幅 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">{welcome.title}</h1>
            <p className="text-blue-100 text-sm">{welcome.subtitle}</p>
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-medium bg-white/20"
          >
            {roleBadge.text}
          </span>
        </div>
      </div>

      {/* 审批人：待审批提醒卡片 */}
      {canApprove && stats.pendingApproval > 0 && (
        <Card className="p-4 border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg">
                <span className="text-2xl">📥</span>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-800">待审批报销单</p>
                <p className="text-3xl font-bold text-amber-900">{stats.pendingApproval} <span className="text-base font-normal">笔</span></p>
              </div>
            </div>
            <Link
              href="/dashboard/approvals"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors shadow-md"
            >
              立即处理 →
            </Link>
          </div>
        </Card>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">我的报销</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.myTotal}</p>
              <p className="text-xs text-gray-400 mt-1">累计提交</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <span className="text-2xl">📋</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">审批中</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{stats.myPending}</p>
              <p className="text-xs text-gray-400 mt-1">等待处理</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <span className="text-2xl">⏳</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">已批准</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.myApproved}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats.myRejected > 0 ? `已拒绝 ${stats.myRejected}` : '待打款'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">累计金额</p>
              <p className="text-xl font-bold text-indigo-600 mt-1">
                {formatAmount(stats.myTotalAmount)}
              </p>
              <p className="text-xs text-gray-400 mt-1">已打款 {stats.myPaid} 笔</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 管理员：全公司统计 */}
      {isAdmin && (
        <>
          <div className="flex items-center gap-2 mt-2">
            <h2 className="text-lg font-semibold text-gray-900">全公司报销概览</h2>
            <span className="text-xs text-gray-400">（管理员视角）</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4 border-l-4 border-l-indigo-500">
              <div>
                <p className="text-sm text-gray-500">报销总数</p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{stats.companyTotal}</p>
                <p className="text-xs text-gray-400 mt-1">全公司累计</p>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-amber-500">
              <div>
                <p className="text-sm text-gray-500">待审批</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{stats.companyPending}</p>
                <p className="text-xs text-gray-400 mt-1">等待处理</p>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-green-500">
              <div>
                <p className="text-sm text-gray-500">已批准</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{stats.companyApproved}</p>
                <p className="text-xs text-gray-400 mt-1">待打款</p>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-emerald-500">
              <div>
                <p className="text-sm text-gray-500">已打款</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.companyPaid}</p>
                <p className="text-xs text-gray-400 mt-1">已完成</p>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-blue-500">
              <div>
                <p className="text-sm text-gray-500">总金额</p>
                <p className="text-xl font-bold text-blue-600 mt-1">
                  {formatAmount(stats.companyTotalAmount)}
                </p>
                <p className="text-xs text-gray-400 mt-1">全公司累计</p>
              </div>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 border-l-4 border-l-purple-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">团队成员</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">{stats.teamMembers}</p>
                  <p className="text-xs text-gray-400 mt-1">已加入公司</p>
                </div>
                <Link
                  href="/dashboard/team"
                  className="px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  管理 →
                </Link>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">待审批总数</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{stats.pendingApproval}</p>
                  <p className="text-xs text-gray-400 mt-1">全公司</p>
                </div>
                <Link
                  href="/dashboard/approvals"
                  className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  查看 →
                </Link>
              </div>
            </Card>
          </div>
        </>
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
                <div className="flex-1">
                  <p className="font-medium">审批报销</p>
                  <p className="text-xs text-amber-500">处理待审批的申请</p>
                </div>
                {stats.pendingApproval > 0 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full">
                    {stats.pendingApproval}
                  </span>
                )}
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

        {/* 最近报销 / 待审批列表 */}
        <Card className="lg:col-span-2">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              {canApprove && pendingApprovals.length > 0 ? '待审批报销' : '最近报销'}
            </h2>
            <Link
              href={canApprove && pendingApprovals.length > 0 ? "/dashboard/approvals" : "/dashboard/reimbursements"}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              查看全部 →
            </Link>
          </div>
          <div className="divide-y">
            {canApprove && pendingApprovals.length > 0 ? (
              pendingApprovals.map((item) => {
                const status = getStatusLabel(item.status);
                const displayAmount = item.totalAmountInBaseCurrency ?? item.totalAmount;
                const displayCurrency = item.baseCurrency || stats.baseCurrency;
                return (
                  <Link
                    key={item.id}
                    href={`/dashboard/reimbursements/${item.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <span className="text-lg">👤</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {item.submitter?.name || '未知'}
                          <span className="text-gray-400 font-normal ml-2">
                            {item.submitter?.department || ''}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">{item.title || '报销单'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {(CURRENCY_SYMBOLS[displayCurrency] || '$')}{displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
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
            ) : recentReimbursements.length === 0 ? (
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
                const displayAmount = item.totalAmountInBaseCurrency ?? item.totalAmount;
                const displayCurrency = item.baseCurrency || stats.baseCurrency;
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
                          {new Date(item.createdAt).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {(CURRENCY_SYMBOLS[displayCurrency] || '$')}{displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
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

      {/* 管理员新手引导 */}
      {isAdmin && stats.teamMembers <= 1 && (
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
