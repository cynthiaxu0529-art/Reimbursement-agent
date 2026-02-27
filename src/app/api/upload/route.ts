import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { apiError } from '@/lib/api-error';

// 强制动态渲染
export const dynamic = 'force-dynamic';

// 支持的文件类型
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

// 最大文件大小: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/upload - 上传文件到 Vercel Blob
 *
 * 请求体: FormData with 'file' field
 * 返回: { success: true, url: string, filename: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 验证登录状态
    const session = await auth();
    if (!session?.user) {
      return apiError('未登录', 401);
    }

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('请选择要上传的文件', 400, 'MISSING_REQUIRED_FIELDS');
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return apiError(`不支持的文件类型: ${file.type}。支持: JPG, PNG, WebP, GIF, PDF`, 400, 'INVALID_FILE_TYPE');
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return apiError(`文件过大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400, 'FILE_TOO_LARGE');
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop() || 'bin';
    const filename = `receipts/${session.user.id}/${timestamp}-${randomStr}.${extension}`;

    // 上传到 Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false, // 我们已经添加了随机字符串
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error: any) {
    console.error('Upload error:', error);

    // 检查是否是 Blob token 未配置的错误
    if (error.message?.includes('BLOB_READ_WRITE_TOKEN')) {
      return apiError('文件存储服务未配置，请联系管理员', 500, 'STORAGE_NOT_CONFIGURED');
    }

    return apiError(`上传失败: ${error.message || '未知错误'}`, 500);
  }
}
