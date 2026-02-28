'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'rgba(15, 10, 46, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
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
              background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.25rem' }}>R</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: '1.25rem', color: '#f1f5f9' }}>
              {t.common.appName}
            </span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <LanguageSwitcher />
            <Link
              href="/login"
              style={{
                color: '#cbd5e1',
                textDecoration: 'none',
                padding: '0.5rem 1rem',
                fontWeight: 500
              }}
            >
              {t.home.login}
            </Link>
            <Link
              href="/register"
              style={{
                background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
                color: 'white',
                padding: '0.625rem 1.25rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              {t.home.register}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(180deg, #0f0a2e 0%, #1a1145 50%, #1e1b4b 100%)',
        padding: '5rem 1.5rem 4rem',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative grid bg */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />

        <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'rgba(129, 140, 248, 0.15)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            color: '#a5b4fc',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '2rem'
          }}>
            <span style={{
              display: 'inline-block',
              width: '8px', height: '8px',
              borderRadius: '50%',
              backgroundColor: '#34d399',
              boxShadow: '0 0 8px rgba(52, 211, 153, 0.6)'
            }} />
            {t.home.heroBadge}
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: '3.25rem',
            fontWeight: 800,
            color: 'white',
            lineHeight: 1.15,
            marginBottom: '1.5rem',
            letterSpacing: '-0.02em'
          }}>
            {t.home.heroTitle1}<br />
            <span style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>{t.home.heroTitle2}</span>
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: '1.2rem',
            color: '#94a3b8',
            marginBottom: '2.5rem',
            lineHeight: 1.7,
            maxWidth: '680px',
            margin: '0 auto 2.5rem'
          }}>
            {t.home.heroDesc1}<br />
            {t.home.heroDesc2}
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '4rem' }}>
            <Link
              href="/register"
              style={{
                background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
                color: 'white',
                padding: '0.875rem 2rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)'
              }}
            >
              {t.home.getStarted}
            </Link>
            <Link
              href="/login"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                padding: '0.875rem 2rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '1rem',
                border: '1px solid rgba(255,255,255,0.15)'
              }}
            >
              {t.home.hasAccount}
            </Link>
          </div>

          {/* Dual-mode visual: Human + Agent */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: '1.5rem',
            maxWidth: '820px',
            margin: '0 auto',
            alignItems: 'center'
          }}>
            {/* Human mode card */}
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '1rem',
              padding: '1.75rem',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
                <div style={{
                  width: '36px', height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '1.1rem' }}>&#x1F464;</span>
                </div>
                <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {t.home.humanMode}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[t.home.humanStep1, t.home.humanStep2, t.home.humanStep3].map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    color: '#94a3b8', fontSize: '0.825rem'
                  }}>
                    <span style={{ color: '#3b82f6' }}>&#x25B8;</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>

            {/* Connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '44px', height: '44px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 24px rgba(99, 102, 241, 0.4)'
              }}>
                <span style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>&#x00D7;</span>
              </div>
              <span style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                {t.home.collab}
              </span>
            </div>

            {/* Agent mode card */}
            <div style={{
              backgroundColor: 'rgba(129, 140, 248, 0.08)',
              border: '1px solid rgba(129, 140, 248, 0.25)',
              borderRadius: '1rem',
              padding: '1.75rem',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
                <div style={{
                  width: '36px', height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #818cf8, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '1.1rem' }}>&#x1F916;</span>
                </div>
                <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem' }}>
                  {t.home.agentMode}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[t.home.agentModeStep1, t.home.agentModeStep2, t.home.agentModeStep3].map((step, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    color: '#a5b4fc', fontSize: '0.825rem'
                  }}>
                    <span style={{ color: '#818cf8' }}>&#x25B8;</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ padding: '5rem 1.5rem', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              {t.home.coreFeatures}
            </h2>
            <p style={{ color: '#6b7280', fontSize: '1.125rem' }}>
              {t.home.coreFeaturesDesc}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem'
          }}>
            {[
              { icon: '📷', bg: '#dbeafe', title: t.home.feature1Title, desc: t.home.feature1Desc },
              { icon: '✅', bg: '#dcfce7', title: t.home.feature2Title, desc: t.home.feature2Desc },
              { icon: '💬', bg: '#fef3c7', title: t.home.feature3Title, desc: t.home.feature3Desc },
              { icon: '⚡', bg: '#e0e7ff', title: t.home.feature4Title, desc: t.home.feature4Desc },
              { icon: '💰', bg: '#fce7f3', title: t.home.feature5Title, desc: t.home.feature5Desc },
              { icon: '📊', bg: '#ccfbf1', title: t.home.feature6Title, desc: t.home.feature6Desc },
            ].map((feature, idx) => (
              <div key={idx} style={{
                backgroundColor: '#f8fafc',
                borderRadius: '1rem',
                padding: '2rem',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: feature.bg,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{feature.icon}</span>
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                  {feature.title}
                </h3>
                <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Ready Section */}
      <section style={{
        padding: '5rem 1.5rem',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{
              display: 'inline-block',
              backgroundColor: '#e0e7ff',
              color: '#4338ca',
              padding: '0.375rem 1rem',
              borderRadius: '9999px',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '1.5rem'
            }}>
              {t.home.agentBadge}
            </div>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginBottom: '1rem' }}>
              {t.home.agentSectionTitle}
            </h2>
            <p style={{ color: '#6b7280', fontSize: '1.125rem', maxWidth: '700px', margin: '0 auto' }}>
              {t.home.agentSectionDesc}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem',
            marginBottom: '3rem'
          }}>
            {[
              { icon: '🔌', bg: '#e0e7ff', title: t.home.agent1Title, desc: t.home.agent1Desc },
              { icon: '🔐', bg: '#fef3c7', title: t.home.agent2Title, desc: t.home.agent2Desc },
              { icon: '🤖', bg: '#dcfce7', title: t.home.agent3Title, desc: t.home.agent3Desc },
              { icon: '🛡️', bg: '#fce7f3', title: t.home.agent4Title, desc: t.home.agent4Desc },
            ].map((feature, idx) => (
              <div key={idx} style={{
                backgroundColor: 'white',
                borderRadius: '1rem',
                padding: '2rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  backgroundColor: feature.bg,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{feature.icon}</span>
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '0.75rem' }}>
                  {feature.title}
                </h3>
                <p style={{ color: '#6b7280', lineHeight: 1.6 }}>
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Agent setup steps */}
          <div style={{
            backgroundColor: '#1e1b4b',
            borderRadius: '1rem',
            padding: '2.5rem',
            maxWidth: '680px',
            margin: '0 auto'
          }}>
            <h3 style={{ color: 'white', fontWeight: 600, fontSize: '1.125rem', marginBottom: '1.5rem' }}>
              {t.home.agentCodeTitle}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[t.home.agentStep1, t.home.agentStep2, t.home.agentStep3].map((step, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  padding: '1rem 1.25rem',
                  borderRadius: '0.75rem',
                  borderLeft: '3px solid #818cf8'
                }}>
                  <span style={{
                    color: '#a5b4fc',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    whiteSpace: 'nowrap'
                  }}>
                    {step}
                  </span>
                </div>
              ))}
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
            {t.home.ctaTitle}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.125rem', marginBottom: '2rem' }}>
            {t.home.ctaDesc}
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
            {t.home.ctaButton}
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
        <p>{t.home.footer}</p>
      </footer>
    </div>
  );
}
