import { connection } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { COOKIE_NAME, verifySessionToken } from '@/lib/auth.ts';

export async function GET(req: NextRequest) {
  await connection();
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const result = await query(`
      SELECT
        a.approval_id,
        a.event_id,
        e.title AS event_title,
        e.status AS event_status,
        a.stage::text AS stage,
        a.status::text AS status,
        a.approver_id,
        u.full_name AS approver_name,
        a.remarks,
        a.decided_at
      FROM approvals a
      JOIN events e ON e.event_id = a.event_id
      LEFT JOIN users u ON u.user_id = a.approver_id
      ORDER BY
        a.event_id,
        CASE a.stage::text
          WHEN 'Faculty' THEN 1
          WHEN 'HOD' THEN 2
          WHEN 'Admin' THEN 3
          ELSE 4
        END
    `);

    return NextResponse.json({
      success: true,
      approvals: result.rows,
      currentUser: {
        userId: session.userId,
        fullName: session.fullName,
        roleName: session.roleName,
      },
    });
  } catch (error) {
    console.error('Error fetching approvals:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to fetch approvals.' },
      { status: 500 }
    );
  }
}

