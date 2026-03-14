'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

// 导航项定义（按角色分组，用于合并）
const navItems = {
  // 通用
  dashboard: { name: '仪表盘', href: '/dashboard', icon: '📊' },
  settings: { name: '设置', href: '/dashboard/settings', icon: '⚙️' },
  // 员工专属
  myReimbursements: { name: '我的报销', href: '/dashboard/reimbursements', icon: '📄' },
  advances: { name: '预借款', href: '/dashboard/advances', icon: '💰' },
  trips: { name: '行程', href: '/dashboard/trips', icon: '✈️' },
  chat: { name: 'AI 助手', href: '/dashboard/chat', icon: '💬' },
  // 审批人专属
  approvals: { name: '待审批', href: '/dashboard/approvals', icon: '✅' },
  approvalHistory: { name: '审批历史', href: '/dashboard/approvals/history', icon: '📋' },
  // 财务专属
  disbursements: { name: '付款处理', href: '/dashboard/disbursements', icon: '💳' },
  exchangeRates: { name: '汇率设置', href: '/dashboard/settings/exchange-rates', icon: '💱' },
  // 管理员专属
  team: { name: '团队管理', href: '/dashboard/team', icon: '👥' },
};

// 数据库角色到前端角色的映射
// 注意：super_admin 需要保持独立，因为它有所有权限
const DB_TO_FRONTEND_ROLE: Record<string, string> = {
  employee: 'employee',
  manager: 'approver',
  finance: 'finance',
  admin: 'admin',
  super_admin: 'super_admin',  // 保持独立，不映射到 admin
};

// 角色显示信息
const ROLE_INFO: Record<string, { label: string; color: string }> = {
  employee: { label: '员工', color: '#2563eb' },
  approver: { label: '审批人', color: '#7c3aed' },
  finance: { label: '财务', color: '#059669' },
  admin: { label: '管理员', color: '#dc2626' },
  super_admin: { label: '超级管理员', color: '#7c2d12' },
};

// 根据角色数组构建导航菜单
function buildNavigation(roles: string[]) {
  const nav: typeof navItems[keyof typeof navItems][] = [];
  const added = new Set<string>();

  const addItem = (item: typeof navItems[keyof typeof navItems]) => {
    if (!added.has(item.href)) {
      nav.push(item);
      added.add(item.href);
    }
  };

  // 仪表盘始终在最前
  addItem(navItems.dashboard);

  // 员工功能（所有人都有）
  if (roles.includes('employee')) {
    addItem(navItems.myReimbursements);
    addItem(navItems.advances);
    addItem(navItems.trips);
    addItem(navItems.chat);
  }

  // 审批人功能（approver 或 super_admin，admin 不包含审批权限）
  if (roles.includes('approver') || roles.includes('super_admin')) {
    addItem(navItems.approvals);
    addItem(navItems.approvalHistory);
  }

  // 财务功能（finance 或 super_admin，admin 不包含财务权限）
  if (roles.includes('finance') || roles.includes('super_admin')) {
    addItem(navItems.disbursements);
    addItem(navItems.exchangeRates);
  }

  // 管理员功能（admin 或 super_admin 都可以管理团队）
  if (roles.includes('admin') || roles.includes('super_admin')) {
    addItem(navItems.team);
  }

  // 设置始终在最后
  addItem(navItems.settings);

  return nav;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [roles, setRoles] = useState<string[]>(['employee']);
  const [loading, setLoading] = useState(true);

  // 初始化：从数据库获取角色数组
  useEffect(() => {
    const initRoles = async () => {
      try {
        const response = await fetch('/api/settings/role');
        const result = await response.json();
        if (result.success && result.roles) {
          // 转换数据库角色到前端角色
          const frontendRoles = result.roles.map((r: string) => DB_TO_FRONTEND_ROLE[r] || r);
          // 去重
          const uniqueRoles = [...new Set(frontendRoles)] as string[];
          setRoles(uniqueRoles);
        }
      } catch {
        setRoles(['employee']);
      } finally {
        setLoading(false);
      }
    };
    initRoles();
  }, []);

  // 根据角色构建导航
  const navigation = buildNavigation(roles);

  // 获取主要角色（用于显示颜色，按权限优先级排序）
  const primaryRole = roles.includes('super_admin') ? 'super_admin'
    : roles.includes('admin') ? 'admin'
    : roles.includes('finance') ? 'finance'
    : roles.includes('approver') ? 'approver'
    : 'employee';
  const primaryColor = ROLE_INFO[primaryRole]?.color || '#2563eb';

  // 角色标签显示
  const roleLabels = roles.map(r => ROLE_INFO[r]?.label).filter(Boolean).join(' / ');

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

        {/* Role Display (多角色显示，不可切换) */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <div
            style={{
              padding: '0.625rem 0.875rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <div style={{ fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>我的角色</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {roles.map(r => (
                <span
                  key={r}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.125rem 0.5rem',
                    backgroundColor: ROLE_INFO[r]?.color + '20',
                    color: ROLE_INFO[r]?.color,
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  {ROLE_INFO[r]?.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
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
                  backgroundColor: isActive ? primaryColor + '15' : 'transparent',
                  color: isActive ? primaryColor : '#4b5563'
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
            backgroundColor: primaryColor,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: 500 }}>U</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>用户</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roleLabels}</div>
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
            {roles.includes('employee') && (
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
