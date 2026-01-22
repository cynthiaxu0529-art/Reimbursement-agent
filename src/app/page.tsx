import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.25rem' }}>R</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: '1.25rem', color: '#111827' }}>
              报销助手
            </span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link
              href="/login"
              style={{
                color: '#4b5563',
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                fontWeight: 500
              }}
            >
              登录
            </Link>
            <Link
              href="/register"
              style={{
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '0.625rem 1.25rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              免费注册
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
        padding: '5rem 1.5rem'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            backgroundColor: '#dbeafe',
            color: '#1d4ed8',
            padding: '0.375rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '1.5rem'
          }}>
            🚀 AI 驱动的智能报销平台
          </div>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.2,
            marginBottom: '1.5rem'
          }}>
            让报销变得
            <span style={{ color: '#2563eb' }}>简单高效</span>
          </h1>
          <p style={{
            fontSize: '1.25rem',
            color: '#6b7280',
            marginBottom: '2.5rem',
            lineHeight: 1.6
          }}>
            自动收集票据、智能识别信息、一键提交审批<br />
            告别繁琐的报销流程，让 AI 帮你搞定一切
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <Link
              href="/register"
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: 'white',
                padding: '0.875rem 2rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
              }}
            >
              开始使用 →
            </Link>
            <Link
              href="/login"
              style={{
                backgroundColor: 'white',
                color: '#374151',
                padding: '0.875rem 2rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '1rem',
                border: '1px solid #d1d5db'
              }}
            >
              已有账号
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ padding: '5rem 1.5rem', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              核心功能
            </h2>
            <p style={{ color: '#6b7280', fontSize: '1.125rem' }}>
              强大的 AI 能力，让报销管理变得轻松
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem'
          }}>
            {/* Feature 1 */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '1rem',
              padding: '2rem',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#dbeafe',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>📷</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                智能票据识别
              </h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                拍照上传发票，AI 自动识别金额、日期、商家等关键信息
              </p>
            </div>

            {/* Feature 2 */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '1rem',
              padding: '2rem',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#dcfce7',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>✅</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                自动合规检查
              </h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                实时检查是否符合公司报销政策，避免退回重提
              </p>
            </div>

            {/* Feature 3 */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '1rem',
              padding: '2rem',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#fef3c7',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>💬</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                AI 对话助手
              </h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                用自然语言描述出差情况，AI 帮你自动整理报销单
              </p>
            </div>

            {/* Feature 4 */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '1rem',
              padding: '2rem',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#e0e7ff',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>⚡</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                快速审批
              </h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                智能审批流程，一键批量审批，提高效率
              </p>
            </div>

            {/* Feature 5 */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '1rem',
              padding: '2rem',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#fce7f3',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>💰</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                一键打款
              </h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                审批通过后自动发起打款，资金快速到账
              </p>
            </div>

            {/* Feature 6 */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '1rem',
              padding: '2rem',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#ccfbf1',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>📊</span>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                数据报表
              </h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                可视化报表分析，了解费用支出趋势
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)',
        padding: '4rem 1.5rem',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'white', marginBottom: '1rem' }}>
            准备好简化你的报销流程了吗？
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.125rem', marginBottom: '2rem' }}>
            免费注册，立即体验 AI 驱动的智能报销
          </p>
          <Link
            href="/register"
            style={{
              display: 'inline-block',
              backgroundColor: 'white',
              color: '#1e40af',
              padding: '0.875rem 2.5rem',
              borderRadius: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '1rem'
            }}
          >
            免费开始使用
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        backgroundColor: '#111827',
        color: '#9ca3af',
        padding: '2rem 1.5rem',
        textAlign: 'center'
      }}>
        <p>© 2024 报销助手. All rights reserved.</p>
      </footer>
    </div>
  );
}
