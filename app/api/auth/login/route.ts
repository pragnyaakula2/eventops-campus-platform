import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, COOKIE_NAME } from '@/lib/auth.ts';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const { session, token } = await authenticateUser(email, password);

    const response = NextResponse.json({ success: true, session });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Authentication failed' },
      { status: 401 }
    );
  }
}
