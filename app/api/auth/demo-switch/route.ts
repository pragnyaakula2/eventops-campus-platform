import { NextRequest, NextResponse } from 'next/server';
import { switchDemoRole, COOKIE_NAME, RoleName } from '@/lib/auth.ts';

export async function POST(req: NextRequest) {
  try {
    const { targetRole } = await req.json();
    const { session, token } = await switchDemoRole(targetRole as RoleName);

    const response = NextResponse.json({
      success: true,
      session,
      message: `Demo persona switched to ${targetRole}`,
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (caught: unknown) {
    const err = caught as Error & { status?: number; code?: string };
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to switch demo role' },
      { status: 400 }
    );
  }
}
