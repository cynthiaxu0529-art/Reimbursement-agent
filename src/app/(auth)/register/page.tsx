'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  // 检查是否是邀请链接
  const inviteToken = searchParams.get('invite');
  const inviteEmail = searchParams.get('email');
  const isInvited = !!inviteToken;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 如果是邀请链接，预填邮箱
  useEffect(() => {
    if (inviteEmail) {
      setFormData(prev => ({ ...prev, email: decodeURIComponent(inviteEmail) }));
    }
  }, [inviteEmail]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError(t.register.passwordMismatch);
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError(t.register.passwordTooShort);
      setIsLoading(false);
      return;
    }

    // 非邀请用户必须填写公司名称
    if (!isInvited && !formData.companyName.trim()) {
      setError(t.register.companyRequired);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          companyName: isInvited ? undefined : (formData.companyName || undefined),
          inviteToken: inviteToken || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t.register.registerFailed);
        return;
      }

      router.push('/login?registered=true');
    } catch (err) {
      setError(t.register.registerFailedRetry);
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box' as const
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '0.5rem'
  };

  return (
    <div style={{ width: '100%', maxWidth: '400px' }}>
      {/* Language Switcher */}
      <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
        <LanguageSwitcher />
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem'
          }}>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.5rem' }}>R</span>
          </div>
        </Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
          {isInvited ? t.register.acceptInvite : t.register.createAccount}
        </h1>
        <p style={{ color: '#6b7280' }}>
          {isInvited ? t.register.joinTeam : t.register.registerPlatform}
        </p>
      </div>

      {/* Invite Notice */}
      {isInvited && (
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          <p style={{ color: '#065f46', fontSize: '0.875rem', margin: 0 }}>
            {t.register.invitedNotice}
          </p>
        </div>
      )}

      {/* Form Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb'
      }}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>{t.register.name} *</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder={t.register.namePlaceholder}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>{t.register.email} *</label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="your@email.com"
              readOnly={isInvited}
              style={{
                ...inputStyle,
                backgroundColor: isInvited ? '#f3f4f6' : 'white',
                cursor: isInvited ? 'not-allowed' : 'text',
              }}
            />
            {isInvited && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                {t.register.inviteEmailReadonly}
              </p>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>{t.register.password} *</label>
            <input
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              placeholder={t.register.passwordPlaceholder}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: isInvited ? '1.5rem' : '1rem' }}>
            <label style={labelStyle}>{t.register.confirmPassword} *</label>
            <input
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder={t.register.confirmPasswordPlaceholder}
              style={inputStyle}
            />
          </div>

          {/* 只有非邀请用户才显示创建公司选项 */}
          {!isInvited && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>
                {t.register.companyName} *
              </label>
              <input
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                required
                placeholder={t.register.companyNamePlaceholder}
                style={inputStyle}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                {t.register.companyNameHint}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: isLoading ? '#9ca3af' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? t.register.registering : (isInvited ? t.register.completeRegister : t.register.registerButton)}
          </button>
        </form>
      </div>

      {/* Login Link */}
      <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#6b7280' }}>
        {t.register.hasAccount}{' '}
        <Link href="/login" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
          {t.register.loginNow}
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8fafc',
      padding: '2rem 1rem'
    }}>
      <Suspense fallback={
        <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading...</div>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
