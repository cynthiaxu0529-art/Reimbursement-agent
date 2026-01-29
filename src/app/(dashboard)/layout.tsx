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

// 角色显示信息
const ROLE_INFO: Record<UserRole, { label: string; description: string; color: string }> = {
  employee: { label: '员工', description: '提交和管理报销', color: '#2563eb' },
  approver: { label: '审批人', description: '审批下属报销', color: '#7c3aed' },
  admin: { label: '管理员', description: '管理公司设置和团队', color: '#dc2626' },
  finance: { label: '财务', description: '处理付款和打款', color: '#059669' },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('employee');
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>(['employee']);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // 初始化：从数据库获取角色和可用角色列表
  useEffect(() => {
    const initRole = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success) {
          // 使用activeRole作为当前角色
          const activeRole = result.activeRole as UserRole || 'employee';
          setRole(activeRole);
          localStorage.setItem('userRole', activeRole);

          // 设置可用角色列表
          if (result.availableRoles && Array.isArray(result.availableRoles)) {
            setAvailableRoles(result.availableRoles as UserRole[]);
          }
        }
      } catch {
        // 降级：从 localStorage 读取
        const savedRole = localStorage.getItem('userRole') as UserRole;
        if (savedRole && ['employee', 'approver', 'admin', 'finance'].includes(savedRole)) {
          setRole(savedRole);
        }
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

  // 切换角色：同步到数据库 + localStorage，然后跳转
  const switchRole = async (newRole: UserRole) => {
    setRole(newRole);
    localStorage.setItem('userRole', newRole);
    setShowRoleMenu(false);

    // 同步到数据库
    try {
      await fetch('/api/settings/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
    } catch (error) {
      console.error('Failed to sync role:', error);
    }

    // 跳转到对应角色的默认页面
    if (newRole === 'employee') {
      router.push('/dashboard/reimbursements');
    } else if (newRole === 'approver' || newRole === 'admin') {
      router.push('/dashboard/approvals');
    } else if (newRole === 'finance') {
      router.push('/dashboard/disbursements');
    }
  };

  const navigation = role === 'employee' ? employeeNavigation : role === 'approver' ? approverNavigation : role === 'finance' ? financeNavigation : adminNavigation;
  const currentRoleInfo = ROLE_INFO[role];
  const roleLabel = currentRoleInfo.label;
  const roleColor = currentRoleInfo.color;

  // 角色高亮背景色
  const roleHighlightBg: Record<UserRole, string> = {
    employee: '#eff6ff',
    approver: '#f3e8ff',
    admin: '#fef2f2',
    finance: '#ecfdf5',
  };

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

        {/* Role Switcher */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb', position: 'relative', zIndex: 50 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.875rem',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: roleColor,
                  borderRadius: '50%'
                }} />
                <span style={{ fontWeight: 500, color: '#374151' }}>当前角色: {roleLabel}</span>
              </div>
              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>▼</span>
            </button>

            {showRoleMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '0.25rem',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  zIndex: 100,
                  overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 只显示用户可用的角色 */}
                {availableRoles.map((availableRole, index) => {
                  const info = ROLE_INFO[availableRole];
                  const isActive = role === availableRole;
                  return (
                    <button
                      key={availableRole}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); switchRole(availableRole); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.625rem 0.875rem',
                        backgroundColor: isActive ? roleHighlightBg[availableRole] : 'white',
                        border: 'none',
                        borderTop: index > 0 ? '1px solid #e5e7eb' : 'none',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        textAlign: 'left'
                      }}
                    >
                      <span style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: info.color,
                        borderRadius: '50%'
                      }} />
                      <div>
                        <div style={{ fontWeight: 500, color: '#374151' }}>{info.label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{info.description}</div>
                      </div>
                      {isActive && <span style={{ marginLeft: 'auto', color: info.color }}>✓</span>}
                    </button>
                  );
                })}
                {/* 如果只有一个角色可用，显示提示 */}
                {availableRoles.length === 1 && (
                  <div style={{
                    padding: '0.5rem 0.875rem',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    textAlign: 'center'
                  }}>
                    当前账户仅有员工权限
                  </div>
                )}
              </div>
            )}
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

      {/* Click outside to close role menu */}
      {showRoleMenu && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: '240px',
            zIndex: 40
          }}
          onClick={() => setShowRoleMenu(false)}
        />
      )}
    </div>
  );
}
