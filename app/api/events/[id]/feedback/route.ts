import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, assertUserHasRole, COOKIE_NAME } from '@/lib/auth.ts';
import { query } from '@/lib/db.ts';
import { getDb, logSystemAudit } from '@/lib/mongodb.ts';

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

    // Check student has confirmed registration or attendance
    const regRes = await query(
      `SELECT registration_id, status FROM registrations 
       WHERE event_id = $1 AND student_id = $2`,
      [eventId, student.userId]
    );

    if (regRes.rows.length === 0 || regRes.rows[0].status === 'Cancelled') {
      return NextResponse.json(
        { success: false, error: 'Only students registered for this event can submit feedback.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const rating = Number(body.rating);

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be an integer between 1 and 5.' },
        { status: 400 }
      );
    }

    const content_quality = body.content_quality ? Math.min(5, Math.max(1, Number(body.content_quality))) : rating;
    const organization_rating = body.organization_rating ? Math.min(5, Math.max(1, Number(body.organization_rating))) : rating;
    const venue_rating = body.venue_rating ? Math.min(5, Math.max(1, Number(body.venue_rating))) : rating;
    const comments = body.comments ? String(body.comments).slice(0, 1000) : null;
    const tags = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const would_recommend = body.would_recommend !== false;

    const db = await getDb();
    const feedbackCol = db.collection('event_feedback');

    const feedbackDoc = {
      event_id: eventId,
      student_id: student.userId,
      rating,
      content_quality,
      organization_rating,
      venue_rating,
      comments,
      tags,
      would_recommend,
      created_at: new Date(),
    };

    try {
      await feedbackCol.insertOne(feedbackDoc);
    } catch (dbErr: any) {
      if (dbErr.code === 11000) {
        return NextResponse.json(
          { success: false, error: 'You have already submitted feedback for this event.' },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    // Audit log
    await logSystemAudit({
      action: 'EVENT_FEEDBACK_SUBMITTED',
      entityType: 'EVENT',
      entityId: eventId,
      actorId: student.userId,
      actorEmail: student.email,
      actorRole: student.roleName,
      details: { rating, would_recommend, tagCount: tags.length },
    });

    return NextResponse.json({
      success: true,
      message: 'Feedback submitted successfully! Thank you.',
      feedback: feedbackDoc,
    });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to submit feedback' },
      { status }
    );
  }
}
