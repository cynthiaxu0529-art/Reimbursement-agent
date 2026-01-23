'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

type UserRole = 'employee' | 'approver' | 'admin';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [role, setRole] = useState<UserRole>('employee');
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // 从 localStorage 读取角色
  useEffect(() => {
    const savedRole = localStorage.getItem('userRole') as UserRole;
    if (savedRole && (savedRole === 'employee' || savedRole === 'approver' || savedRole === 'admin')) {
      setRole(savedRole);
    }
  }, []);

  // 切换角色
  const switchRole = (newRole: UserRole) => {
    setRole(newRole);
    localStorage.setItem('userRole', newRole);
    setShowRoleMenu(false);
  };

  const navigation = role === 'employee' ? employeeNavigation : role === 'approver' ? approverNavigation : adminNavigation;
  const roleLabel = role === 'employee' ? '员工' : role === 'approver' ? '审批人' : '管理员';
  const roleColor = role === 'employee' ? '#2563eb' : role === 'approver' ? '#7c3aed' : '#dc2626';

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
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
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
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); switchRole('employee'); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 0.875rem',
                    backgroundColor: role === 'employee' ? '#eff6ff' : 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: '#2563eb',
                    borderRadius: '50%'
                  }} />
                  <div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>员工</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>提交和管理报销</div>
                  </div>
                  {role === 'employee' && <span style={{ marginLeft: 'auto', color: '#2563eb' }}>✓</span>}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); switchRole('approver'); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 0.875rem',
                    backgroundColor: role === 'approver' ? '#f3e8ff' : 'white',
                    border: 'none',
                    borderTop: '1px solid #e5e7eb',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: '#7c3aed',
                    borderRadius: '50%'
                  }} />
                  <div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>审批人</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>审批下属报销</div>
                  </div>
                  {role === 'approver' && <span style={{ marginLeft: 'auto', color: '#7c3aed' }}>✓</span>}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); switchRole('admin'); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 0.875rem',
                    backgroundColor: role === 'admin' ? '#fef2f2' : 'white',
                    border: 'none',
                    borderTop: '1px solid #e5e7eb',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textAlign: 'left'
                  }}
                >
                  <span style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: '#dc2626',
                    borderRadius: '50%'
                  }} />
                  <div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>管理员</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>管理公司设置和团队</div>
                  </div>
                  {role === 'admin' && <span style={{ marginLeft: 'auto', color: '#dc2626' }}>✓</span>}
                </button>
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
            inset: 0,
            zIndex: 40
          }}
          onClick={() => setShowRoleMenu(false)}
        />
      )}
    </div>
  );
}
