'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

// 数据库角色到前端角色的映射
// 注意：super_admin 需要保持独立，因为它有所有权限
const DB_TO_FRONTEND_ROLE: Record<string, string> = {
  employee: 'employee',
  manager: 'approver',
  finance: 'finance',
  admin: 'admin',
  super_admin: 'super_admin',  // 保持独立，不映射到 admin
};

// 角色颜色
const ROLE_COLORS: Record<string, string> = {
  employee: '#2563eb',
  approver: '#7c3aed',
  finance: '#059669',
  admin: '#dc2626',
  super_admin: '#7c2d12',
};

// 导航项定义（按角色分组，用于合并）
function getNavItems(t: ReturnType<typeof useLanguage>['t']) {
  return {
    // 通用
    dashboard: { name: t.nav.dashboard, href: '/dashboard', icon: '📊' },
    settings: { name: t.nav.settings, href: '/dashboard/settings', icon: '⚙️' },
    // 员工专属
    myReimbursements: { name: t.nav.myReimbursements, href: '/dashboard/reimbursements', icon: '📄' },
    advances: { name: t.nav.advances, href: '/dashboard/advances', icon: '💰' },
    trips: { name: t.nav.trips, href: '/dashboard/trips', icon: '✈️' },
    chat: { name: t.nav.chat, href: '/dashboard/chat', icon: '💬' },
    // 审批人专属
    approvals: { name: t.nav.approvals, href: '/dashboard/approvals', icon: '✅' },
    approvalHistory: { name: t.nav.approvalHistory, href: '/dashboard/approvals/history', icon: '📋' },
    // 财务专属
    disbursements: { name: t.nav.disbursements, href: '/dashboard/disbursements', icon: '💳' },
    exchangeRates: { name: t.nav.exchangeRates, href: '/dashboard/settings/exchange-rates', icon: '💱' },
    accountingSummaries: { name: t.nav.accountingSummaries, href: '/dashboard/accounting-summaries', icon: '📒' },
    // API Key（所有人可用）
    apiKeys: { name: 'API Keys', href: '/dashboard/settings/api-keys', icon: '🔑' },
    // 管理员专属
    team: { name: t.nav.team, href: '/dashboard/team', icon: '👥' },
  };
}

type NavItem = { name: string; href: string; icon: string };

// 根据角色数组构建导航菜单
function buildNavigation(roles: string[], navItems: ReturnType<typeof getNavItems>) {
  const nav: NavItem[] = [];
  const added = new Set<string>();

  const addItem = (item: NavItem) => {
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
    addItem(navItems.accountingSummaries);
  }

  // 管理员功能（admin 或 super_admin 都可以管理团队）
  if (roles.includes('admin') || roles.includes('super_admin')) {
    addItem(navItems.team);
  }

  // API Keys（所有人可用）
  addItem(navItems.apiKeys);

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
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>(['employee']);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const { t } = useLanguage();

  // 初始化：从数据库获取角色数组和用户信息
  useEffect(() => {
    const initUser = async () => {
      try {
        // 并行获取角色和用户信息
        const [roleRes, meRes] = await Promise.all([
          fetch('/api/settings/role'),
          fetch('/api/auth/me'),
        ]);

        // 如果 API 返回 401，说明未认证，跳转登录页
        if (meRes.status === 401 || roleRes.status === 401) {
          router.push('/login');
          return;
        }

        const roleResult = await roleRes.json();
        if (roleResult.success && roleResult.roles) {
          const frontendRoles = roleResult.roles.map((r: string) => DB_TO_FRONTEND_ROLE[r] || r);
          const uniqueRoles = [...new Set(frontendRoles)] as string[];
          setRoles(uniqueRoles);
        }
        const meResult = await meRes.json();
        if (meResult.success && meResult.data) {
          setUserName(meResult.data.name || '');
          setUserEmail(meResult.data.email || '');
        }
      } catch {
        setRoles(['employee']);
      } finally {
        setLoading(false);
      }
    };
    initUser();
  }, [router]);

  const navItems = getNavItems(t);

  // 根据角色构建导航
  const navigation = buildNavigation(roles, navItems);

  // 获取主要角色（用于显示颜色，按权限优先级排序）
  const primaryRole = roles.includes('super_admin') ? 'super_admin'
    : roles.includes('admin') ? 'admin'
    : roles.includes('finance') ? 'finance'
    : roles.includes('approver') ? 'approver'
    : 'employee';
  const primaryColor = ROLE_COLORS[primaryRole] || '#2563eb';

  // 角色标签显示
  const getRoleLabel = (role: string) => {
    const key = role as keyof typeof t.roles;
    return t.roles[key] || role;
  };
  const roleLabels = roles.map(r => getRoleLabel(r)).filter(Boolean).join(' / ');

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
          <span style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>{t.common.appName}</span>
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
            <div style={{ fontWeight: 500, color: '#374151', marginBottom: '0.25rem' }}>{t.nav.myRoles}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {roles.map(r => (
                <span
                  key={r}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.125rem 0.5rem',
                    backgroundColor: (ROLE_COLORS[r] || '#2563eb') + '20',
                    color: ROLE_COLORS[r] || '#2563eb',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  {getRoleLabel(r)}
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
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: primaryColor,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: 500 }}>
                {userName ? userName.charAt(0).toUpperCase() : 'U'}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName || t.common.user}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={userEmail}>
                {userEmail || roleLabels}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut({ redirect: false });
              window.location.href = '/login';
            }}
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
              color: '#4b5563',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
            }}
          >
            {t.common.logout || '退出登录'}
          </button>
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
            {navigation.find((n) => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href)))?.name || t.nav.dashboard}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <LanguageSwitcher />
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
                {t.nav.newReimbursement}
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
