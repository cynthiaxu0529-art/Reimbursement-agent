/**
 * 邮件服务 - 支持 Resend 和 Gmail SMTP 两种方式
 * 通过 EMAIL_PROVIDER 环境变量切换
 */

import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * 使用 Resend 发送邮件
 */
async function sendWithResend(options: EmailOptions): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY 未配置' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Resend exception:', error);
    return { success: false, error: '发送失败' };
  }
}

/**
 * 使用 Gmail SMTP 发送邮件
 */
async function sendWithSMTP(options: EmailOptions): Promise<EmailResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, EMAIL_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { success: false, error: 'SMTP 配置不完整，请检查 SMTP_HOST, SMTP_USER, SMTP_PASS' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '465'),
      secure: SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: EMAIL_FROM || SMTP_USER,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('SMTP error:', error);
    return { success: false, error: error instanceof Error ? error.message : '发送失败' };
  }
}

/**
 * 发送邮件 - 根据 EMAIL_PROVIDER 自动选择发送方式
 * EMAIL_PROVIDER=resend  -> 使用 Resend API
 * EMAIL_PROVIDER=smtp    -> 使用 SMTP (Gmail)
 * 默认使用 smtp
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  console.log(`[Email] Using provider: ${provider}`);

  if (provider === 'resend') {
    return sendWithResend(options);
  } else {
    return sendWithSMTP(options);
  }
}

/**
 * 检查邮件服务配置是否完整
 */
export function checkEmailConfig(): { configured: boolean; provider: string; error?: string } {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  if (provider === 'resend') {
    if (!process.env.RESEND_API_KEY) {
      return { configured: false, provider, error: 'RESEND_API_KEY 未配置' };
    }
    return { configured: true, provider };
  } else {
    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return { configured: false, provider, error: 'SMTP 配置不完整' };
    }
    return { configured: true, provider };
  }
}
