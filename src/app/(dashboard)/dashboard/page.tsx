import Link from 'next/link';

export default function DashboardPage() {
  // 空数据状态 - 实际数据将从API获取
  const stats = [
    { label: '待审批', value: '0', icon: '⏳', bgColor: '#fef3c7', color: '#d97706' },
    { label: '本月报销', value: '¥0', icon: '💰', bgColor: '#dbeafe', color: '#2563eb' },
    { label: '已完成', value: '0', icon: '✅', bgColor: '#dcfce7', color: '#16a34a' },
    { label: '团队成员', value: '1', icon: '👥', bgColor: '#f3e8ff', color: '#9333ea' },
  ];

  return (
    <div>
      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        color: 'white',
        marginBottom: '1.5rem'
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          欢迎使用 Fluxa 报销系统
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.9)', marginBottom: '1rem' }}>
          作为管理员，你可以邀请团队成员、设置报销政策，并审批报销申请
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link
            href="/dashboard/settings"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'white',
              color: '#2563eb',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem'
            }}
          >
            邀请团队成员 →
          </Link>
          <Link
            href="/dashboard/chat"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.875rem'
            }}
          >
            体验 AI 助手
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>{stat.label}</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: stat.color }}>{stat.value}</p>
              </div>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: stat.bgColor,
                borderRadius: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: '1.5rem'
      }}>
        {/* Getting Started */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>开始使用</h2>
          </div>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#dcfce7',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#16a34a'
                }}>
                  ✓
                </div>
                <span style={{ color: '#111827', fontWeight: 500 }}>创建公司账号</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#d97706'
                }}>
                  2
                </div>
                <Link href="/dashboard/settings" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                  邀请团队成员 →
                </Link>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#6b7280'
                }}>
                  3
                </div>
                <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none' }}>
                  设置报销政策
                </Link>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  color: '#6b7280'
                }}>
                  4
                </div>
                <span style={{ color: '#6b7280' }}>提交第一笔报销</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>快速操作</h2>
          </div>
          <div style={{ padding: '1rem' }}>
            <Link
              href="/dashboard/reimbursements/new"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                marginBottom: '0.5rem',
                fontWeight: 500
              }}
            >
              <span>📝</span> 新建报销
            </Link>
            <Link
              href="/dashboard/chat"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: '#f3e8ff',
                color: '#9333ea',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                marginBottom: '0.5rem',
                fontWeight: 500
              }}
            >
              <span>🤖</span> AI 助手上传票据
            </Link>
            <Link
              href="/dashboard/approvals"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: '#fef3c7',
                color: '#d97706',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                marginBottom: '0.5rem',
                fontWeight: 500
              }}
            >
              <span>✅</span> 审批报销
            </Link>
            <Link
              href="/dashboard/settings"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              <span>⚙️</span> 系统设置
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
