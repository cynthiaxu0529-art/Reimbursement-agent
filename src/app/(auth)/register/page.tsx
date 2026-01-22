'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function RegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 验证密码
    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('密码至少需要8个字符');
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
          companyName: formData.companyName || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '注册失败');
        return;
      }

      // 注册成功，跳转到登录页
      router.push('/login?registered=true');
    } catch (err) {
      setError('注册失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">R</span>
          </div>
          <CardTitle className="text-2xl">创建账号</CardTitle>
          <CardDescription>注册使用报销管理平台</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">姓名 *</label>
              <Input
                name="name"
                placeholder="张三"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">邮箱 *</label>
              <Input
                name="email"
                type="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">密码 *</label>
              <Input
                name="password"
                type="password"
                placeholder="至少8个字符"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">确认密码 *</label>
              <Input
                name="confirmPassword"
                type="password"
                placeholder="再次输入密码"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                公司名称 <span className="text-gray-400">(可选)</span>
              </label>
              <Input
                name="companyName"
                placeholder="创建新公司"
                value={formData.companyName}
                onChange={handleChange}
              />
              <p className="text-xs text-gray-500 mt-1">
                填写后将创建新公司，您将成为管理员
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '注册中...' : '注册'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            已有账号？{' '}
            <Link href="/login" className="text-blue-600 hover:underline">
              立即登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
