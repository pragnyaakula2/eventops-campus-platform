import { NextRequest, NextResponse } from 'next/server';
import { getEventDetails } from '@/lib/events.ts';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = Number(id);

    if (isNaN(eventId)) {
      return NextResponse.json({ success: false, error: 'Invalid event ID' }, { status: 400 });
    }

    const event = await getEventDetails(eventId);

    if (!event) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, event });
  } catch (err: any) {
    console.error('Error fetching event details:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch event details' },
      { status: 500 }
    );
  }
}
