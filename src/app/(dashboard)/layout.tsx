'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

// 员工导航
const employeeNavigation = [
  { name: '仪表盘', href: '/dashboard', icon: '📊' },
  { name: '我的报销', href: '/dashboard/reimbursements', icon: '📄' },
  { name: '行程', href: '/dashboard/trips', icon: '✈️' },
  { name: 'AI 助手', href: '/dashboard/chat', icon: '💬' },
  { name: '设置', href: '/dashboard/settings', icon: '⚙️' },
];

// 审批人导航
const approverNavigation = [
  { name: '仪表盘', href: '/dashboard', icon: '📊' },
  { name: '待审批', href: '/dashboard/approvals', icon: '✅' },
  { name: '审批历史', href: '/dashboard/approvals/history', icon: '📋' },
  { name: '设置', href: '/dashboard/settings', icon: '⚙️' },
];

// 管理员导航
const adminNavigation = [
  { name: '仪表盘', href: '/dashboard', icon: '📊' },
  { name: '待审批', href: '/dashboard/approvals', icon: '✅' },
  { name: '审批历史', href: '/dashboard/approvals/history', icon: '📋' },
  { name: '团队管理', href: '/dashboard/team', icon: '👥' },
  { name: '设置', href: '/dashboard/settings', icon: '⚙️' },
];

// 财务导航
const financeNavigation = [
  { name: '仪表盘', href: '/dashboard', icon: '📊' },
  { name: '付款处理', href: '/dashboard/disbursements', icon: '💳' },
  { name: '付款历史', href: '/dashboard/disbursements/history', icon: '📋' },
  { name: '汇率设置', href: '/dashboard/settings/exchange-rates', icon: '💱' },
  { name: '设置', href: '/dashboard/settings', icon: '⚙️' },
];

type UserRole = 'employee' | 'approver' | 'admin' | 'finance';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('employee');

  // 初始化：从数据库获取角色（只读，不允许切换）
  useEffect(() => {
    const initRole = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success && result.role) {
          // 数据库角色到前端角色的映射
          const dbToFrontend: Record<string, UserRole> = {
            employee: 'employee',
            manager: 'approver',
            finance: 'finance',
            admin: 'admin',
            super_admin: 'admin',
          };
          const frontendRole = dbToFrontend[result.role] || 'employee';
          setRole(frontendRole);
        }
      } catch {
        // 出错时默认为员工角色
        setRole('employee');
      }
    };
    initRole();
  }, []);

  // 检查当前页面是否对当前角色可访问，如果不是则跳转
  useEffect(() => {
    // 员工不能访问审批、付款等页面
    if (role === 'employee') {
      if (pathname.startsWith('/dashboard/approvals') || pathname.startsWith('/dashboard/disbursements') || pathname.startsWith('/dashboard/team')) {
        router.push('/dashboard/reimbursements');
      }
    }
    // 审批人不能访问员工的报销页面和付款页面
    else if (role === 'approver') {
      if (pathname.startsWith('/dashboard/reimbursements') || pathname.startsWith('/dashboard/disbursements') || pathname.startsWith('/dashboard/trips') || pathname.startsWith('/dashboard/chat')) {
        router.push('/dashboard/approvals');
      }
    }
    // 财务不能访问员工报销页面和审批页面
    else if (role === 'finance') {
      if (pathname.startsWith('/dashboard/reimbursements') || pathname.startsWith('/dashboard/approvals') || pathname.startsWith('/dashboard/trips') || pathname.startsWith('/dashboard/chat')) {
        router.push('/dashboard/disbursements');
      }
    }
    // 管理员可以访问大部分页面，但不能访问员工报销提交相关页面
    else if (role === 'admin') {
      if (pathname.startsWith('/dashboard/reimbursements') || pathname.startsWith('/dashboard/trips') || pathname.startsWith('/dashboard/chat')) {
        router.push('/dashboard/approvals');
      }
    }
  }, [role, pathname, router]);

  const navigation = role === 'employee' ? employeeNavigation : role === 'approver' ? approverNavigation : role === 'finance' ? financeNavigation : adminNavigation;
  const roleLabel = role === 'employee' ? '员工' : role === 'approver' ? '审批人' : role === 'finance' ? '财务' : '管理员';
  const roleColor = role === 'employee' ? '#2563eb' : role === 'approver' ? '#7c3aed' : role === 'finance' ? '#059669' : '#dc2626';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px',
        backgroundColor: 'white',
        borderRight: '1px solid #e5e7eb',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Logo */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>R</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>报销助手</span>
        </div>

        {/* Role Display (只读，不可切换) */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 0.875rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              backgroundColor: roleColor,
              borderRadius: '50%'
            }} />
            <span style={{ fontWeight: 500, color: '#374151' }}>当前角色: {roleLabel}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '1rem', flex: 1 }}>
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '0.25rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  backgroundColor: isActive ? (role === 'employee' ? '#eff6ff' : role === 'approver' ? '#f3e8ff' : '#fef2f2') : 'transparent',
                  color: isActive ? roleColor : '#4b5563'
                }}
              >
                <span style={{ fontSize: '1.125rem' }}>{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: roleColor,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: 500 }}>U</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>用户</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{roleLabel}模式</div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: '240px' }}>
        {/* Top bar */}
        <header style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem 1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
            {navigation.find((n) => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href)))?.name || '仪表盘'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {role === 'employee' && (
              <Link
                href="/dashboard/reimbursements/new"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: '0.5rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                + 新建报销
              </Link>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ padding: '1.5rem' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
