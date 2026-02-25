/**
 * AI Vision API Route - Food image recognition endpoint
 * Requirements: 4.2, 4.3, 4.5, 4.6, 4.7
 */

import { NextRequest, NextResponse } from 'next/server';
import { recognizeFoodWithTimeout } from '@/services/ai/visionService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传食物照片' },
        { status: 400 },
      );
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: '请上传有效的图片文件' },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: '图片大小不能超过 10MB' },
        { status: 400 },
      );
    }

    // Convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // Call AI recognition with 10-second timeout
    const result = await recognizeFoodWithTimeout(base64Image);

    if (result === null) {
      // Timeout – Requirement 4.5 & 4.7: fallback to manual mode
      return NextResponse.json(
        {
          success: false,
          timedOut: true,
          error: 'AI 识别超时，请手动录入',
        },
        { status: 408 },
      );
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: '未能识别食物，请手动录入',
          data: result,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // Requirement 4.6: show error and allow retry on upload failure
    console.error('Vision API error:', error);
    return NextResponse.json(
      { success: false, error: '识别服务异常，请重试' },
      { status: 500 },
    );
  }
}
