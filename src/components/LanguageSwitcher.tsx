'use client';

import { useLanguage } from '@/contexts/LanguageContext';

export default function LanguageSwitcher({ style }: { style?: React.CSSProperties }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        backgroundColor: '#f3f4f6',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: '#374151',
        cursor: 'pointer',
        transition: 'all 0.2s',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#e5e7eb';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#f3f4f6';
      }}
    >
      <span style={{ fontSize: '0.875rem' }}>🌐</span>
      {t.language.switchTo}
    </button>
  );
}
