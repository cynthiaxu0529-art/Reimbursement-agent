import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reimbursement Portal - 智能报销系统',
  description: 'AI-Native 的企业报销管理平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        margin: 0,
        padding: 0,
        minHeight: '100vh',
        backgroundColor: '#f9fafb'
      }}>
        {children}
      </body>
    </html>
  );
}
