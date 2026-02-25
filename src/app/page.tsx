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
              {t.common.appName}
            </span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <LanguageSwitcher />
            <Link
              href="/login"
              style={{
                color: '#4b5563',
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
                backgroundColor: '#2563eb',
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
            {t.home.heroBadge}
          </div>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.2,
            marginBottom: '1.5rem'
          }}>
            {t.home.heroTitle1}
            <span style={{ color: '#2563eb' }}>{t.home.heroTitle2}</span>
          </h1>
          <p style={{
            fontSize: '1.25rem',
            color: '#6b7280',
            marginBottom: '2.5rem',
            lineHeight: 1.6
          }}>
            {t.home.heroDesc1}<br />
            {t.home.heroDesc2}
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
              {t.home.getStarted}
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
              {t.home.hasAccount}
            </Link>
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
