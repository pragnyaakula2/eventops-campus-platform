import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, assertUserHasRole, COOKIE_NAME } from '@/lib/auth.ts';
import { getStudentParticipationHistory } from '@/lib/events.ts';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = await verifySessionToken(token || '');
    const student = assertUserHasRole(session, ['Student']);

    const registrations = await getStudentParticipationHistory(student.userId);

    return NextResponse.json({ success: true, count: registrations.length, registrations });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch student registrations' },
      { status }
    );
  }
}
