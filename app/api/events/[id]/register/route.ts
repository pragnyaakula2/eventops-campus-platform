import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, assertUserHasRole, COOKIE_NAME } from '@/lib/auth.ts';
import { registerForEvent, cancelRegistration } from '@/lib/events.ts';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = await verifySessionToken(token || '');
    const student = assertUserHasRole(session, ['Student']);

    const { id } = await params;
    const eventId = Number(id);

    if (isNaN(eventId)) {
      return NextResponse.json({ success: false, error: 'Invalid event ID' }, { status: 400 });
    }

    const outcome = await registerForEvent(eventId, student);

    return NextResponse.json({ success: true, outcome });
  } catch (err: any) {
    const status = err.status || 400;
    return NextResponse.json(
      { success: false, error: err.message || 'Registration failed' },
      { status }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = await verifySessionToken(token || '');
    const student = assertUserHasRole(session, ['Student']);

    const { id } = await params;
    const eventId = Number(id);

    if (isNaN(eventId)) {
      return NextResponse.json({ success: false, error: 'Invalid event ID' }, { status: 400 });
    }

    const outcome = await cancelRegistration(eventId, student);

    return NextResponse.json({ success: true, outcome });
  } catch (err: any) {
    const status = err.status || 400;
    return NextResponse.json(
      { success: false, error: err.message || 'Cancellation failed' },
      { status }
    );
  }
}
