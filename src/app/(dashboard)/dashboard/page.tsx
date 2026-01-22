import Link from 'next/link';

const stats = [
  { label: '待审批', value: '3', icon: '⏳', bgColor: '#fef3c7', color: '#d97706' },
  { label: '本月报销', value: '¥12,580', icon: '💰', bgColor: '#dbeafe', color: '#2563eb' },
  { label: '已完成', value: '15', icon: '✅', bgColor: '#dcfce7', color: '#16a34a' },
  { label: '进行中行程', value: '1', icon: '✈️', bgColor: '#f3e8ff', color: '#9333ea' },
];

const recentReimbursements = [
  { id: '1', title: '上海出差报销', amount: 3895, status: 'pending', statusLabel: '待审批', date: '2024-01-18' },
  { id: '2', title: '办公用品采购', amount: 560, status: 'approved', statusLabel: '已批准', date: '2024-01-15' },
  { id: '3', title: '客户招待费用', amount: 1280, status: 'paid', statusLabel: '已付款', date: '2024-01-12' },
];

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#d97706' },
  approved: { bg: '#dcfce7', text: '#16a34a' },
  paid: { bg: '#d1fae5', text: '#059669' },
};

export default function DashboardPage() {
  return (
    <div>
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
        {/* Recent Reimbursements */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>最近报销</h2>
            <Link
              href="/dashboard/reimbursements"
              style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}
            >
              查看全部 →
            </Link>
          </div>
          <div>
            {recentReimbursements.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <p style={{ fontWeight: 500, color: '#111827', marginBottom: '0.25rem' }}>{item.title}</p>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{item.date}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontWeight: 600, color: '#111827' }}>¥{item.amount.toLocaleString()}</span>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    backgroundColor: statusColors[item.status].bg,
                    color: statusColors[item.status].text
                  }}>
                    {item.statusLabel}
                  </span>
                </div>
              </div>
            ))}
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
              <span>💬</span> AI 助手整理报销
            </Link>
            <Link
              href="/dashboard/trips/new"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: '#dcfce7',
                color: '#16a34a',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                marginBottom: '0.5rem',
                fontWeight: 500
              }}
            >
              <span>✈️</span> 创建行程
            </Link>
            <Link
              href="/dashboard/receipts/upload"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                backgroundColor: '#fef3c7',
                color: '#d97706',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              <span>📷</span> 上传票据
            </Link>
          </div>
        </div>
      </div>

      {/* AI Assistant Banner */}
      <div style={{
        marginTop: '1.5rem',
        background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        color: 'white'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              🤖 AI 智能助手
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '1rem' }}>
              试试说："帮我整理上周的出差报销" 或 "检查报销材料是否齐全"
            </p>
            <Link
              href="/dashboard/chat"
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
              开始对话 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
