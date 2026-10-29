import { connection } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { listEvents } from '@/lib/events.ts';



export async function GET(req: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const category_id = searchParams.get('category_id') ? Number(searchParams.get('category_id')) : undefined;
    const club_id = searchParams.get('club_id') ? Number(searchParams.get('club_id')) : undefined;
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

    const events = await listEvents({ search, category_id, club_id, status, limit });

    return NextResponse.json({ success: true, count: events.length, events });
  } catch (err: any) {
    console.error('Error fetching events:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to list events' },
      { status: 500 }
    );
  }
}
