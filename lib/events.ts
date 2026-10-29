/**
 * EventOps Event Operations & Semantic Search Service
 * Connects PostgreSQL procedures/views and MongoDB feedback pipelines.
 */
import { query } from './db.ts';
import { generateEmbedding, formatVectorForPg } from './embeddings.ts';
import { logSystemAudit, getEventFeedbackStats } from './mongodb.ts';
import type { UserSession } from './auth.ts';

export interface EventListItem {
  event_id: number;
  event_title: string;
  event_status: string;
  start_time: string;
  end_time: string;
  club_name: string | null;
  category_name: string | null;
  organizer_name: string;
  venue_names: string;
  capacity: number;
  confirmed_registrations: number;
  waitlist_count: number;
  seats_remaining: number;
  occupancy_percentage: number;
  is_full: boolean;
  similarity_score?: number;
}

export interface ListEventsOptions {
  search?: string;
  category_id?: number;
  club_id?: number;
  status?: string;
  limit?: number;
}

/**
 * Lists events with optional semantic vector search and attribute filters.
 */
export async function listEvents(options: ListEventsOptions = {}): Promise<EventListItem[]> {
  const { search, category_id, club_id, status, limit = 20 } = options;

  if (search && search.trim().length > 0) {
    // 1. Semantic search branch using 384-d dense embeddings
    const queryVector = await generateEmbedding(search.trim());
    const pgVector = formatVectorForPg(queryVector);

    const matchRes = await query(
      `SELECT m.event_id, m.title, m.category_name, m.club_name, m.similarity,
              o.event_status, o.start_time, o.end_time, o.organizer_name,
              o.venue_names, o.capacity, o.confirmed_registrations,
              o.waitlist_count, o.seats_remaining, o.occupancy_percentage, o.is_full
       FROM match_events($1, 0.15, $2) m
       JOIN vw_event_occupancy o ON m.event_id = o.event_id
       ORDER BY m.similarity DESC`,
      [pgVector, limit]
    );

    return matchRes.rows.map((row) => ({
      event_id: row.event_id,
      event_title: row.title,
      event_status: row.event_status,
      start_time: row.start_time,
      end_time: row.end_time,
      club_name: row.club_name,
      category_name: row.category_name,
      organizer_name: row.organizer_name,
      venue_names: row.venue_names,
      capacity: row.capacity,
      confirmed_registrations: row.confirmed_registrations,
      waitlist_count: row.waitlist_count,
      seats_remaining: row.seats_remaining,
      occupancy_percentage: Number(row.occupancy_percentage),
      is_full: Boolean(row.is_full),
      similarity_score: Number(row.similarity),
    }));
  }

  // 2. Standard relational filter branch
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`e.status = $${paramIdx++}`);
    params.push(status);
  }

  if (category_id) {
    conditions.push(`e.category_id = $${paramIdx++}`);
    params.push(category_id);
  }

  if (club_id) {
    conditions.push(`e.club_id = $${paramIdx++}`);
    params.push(club_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const res = await query(
    `SELECT o.*
     FROM vw_event_occupancy o
     JOIN events e ON o.event_id = e.event_id
     ${whereClause}
     ORDER BY o.start_time ASC
     LIMIT $${paramIdx}`,
    params
  );

  return res.rows.map((row) => ({
    ...row,
    occupancy_percentage: Number(row.occupancy_percentage),
    is_full: Boolean(row.is_full),
  }));
}

/**
 * Returns full event details with relational and MongoDB metrics.
 */
export async function getEventDetails(eventId: number) {
  const [occupancyRes, budgetRes, approvalRes, venueRes] = await Promise.all([
    query('SELECT * FROM vw_event_occupancy WHERE event_id = $1', [eventId]),
    query('SELECT * FROM vw_budget_utilization WHERE event_id = $1', [eventId]),
    query('SELECT * FROM vw_pending_approvals_chain WHERE event_id = $1', [eventId]),
    query('SELECT * FROM vw_venue_utilization_calendar WHERE event_id = $1', [eventId]),
  ]);

  const overview = occupancyRes.rows[0];
  if (!overview) {
    return null;
  }

  // Fetch NoSQL feedback metrics from MongoDB
  let feedbackMetrics = null;
  try {
    feedbackMetrics = await getEventFeedbackStats(eventId);
  } catch (err) {
    console.error(`MongoDB feedback fetch error for event ${eventId}:`, err);
  }

  return {
    overview: {
      ...overview,
      occupancy_percentage: Number(overview.occupancy_percentage),
      is_full: Boolean(overview.is_full),
    },
    budget: budgetRes.rows[0] || null,
    approvalChain: approvalRes.rows[0] || null,
    venueBookings: venueRes.rows,
    feedback: feedbackMetrics,
  };
}

/**
 * Atomic student registration using sp_register_or_waitlist.
 */
export async function registerForEvent(eventId: number, student: UserSession) {
  const res = await query(
    'SELECT * FROM sp_register_or_waitlist($1, $2)',
    [eventId, student.userId]
  );

  const outcome = res.rows[0];

  // Record audit log in MongoDB
  try {
    await logSystemAudit({
      action: outcome.result_type === 'Registered' ? 'EVENT_REGISTRATION_SUCCESS' : 'EVENT_WAITLIST_JOINED',
      entityType: 'REGISTRATION',
      entityId: outcome.record_id,
      actorId: student.userId,
      actorEmail: student.email,
      actorRole: student.roleName,
      details: {
        eventId,
        resultType: outcome.result_type,
        queuePosition: outcome.queue_position,
        message: outcome.message,
      },
    });
  } catch (auditErr) {
    console.error('Audit logging error:', auditErr);
  }

  return outcome;
}

/**
 * Atomic registration cancellation and waitlist promotion using sp_cancel_registration_and_promote.
 */
export async function cancelRegistration(eventId: number, student: UserSession) {
  const res = await query(
    'SELECT * FROM sp_cancel_registration_and_promote($1, $2)',
    [eventId, student.userId]
  );

  const outcome = res.rows[0];

  // Record audit log in MongoDB
  try {
    await logSystemAudit({
      action: 'EVENT_REGISTRATION_CANCELLED',
      entityType: 'REGISTRATION',
      entityId: eventId,
      actorId: student.userId,
      actorEmail: student.email,
      actorRole: student.roleName,
      details: {
        eventId,
        cancelledStudentId: outcome.cancelled_student_id,
        promotedStudentId: outcome.promoted_student_id,
        message: outcome.message,
      },
    });
  } catch (auditErr) {
    console.error('Audit logging error:', auditErr);
  }

  return outcome;
}

/**
 * Retrieves registration and attendance history for a student.
 */
export async function getStudentParticipationHistory(studentId: number) {
  const res = await query(
    `SELECT * FROM vw_student_event_history 
     WHERE student_id = $1 
     ORDER BY start_time DESC NULLS LAST`,
    [studentId]
  );
  return res.rows;
}
