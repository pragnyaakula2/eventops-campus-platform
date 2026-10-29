
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logSystemAudit } from '@/lib/mongodb';
import {
  assertUserHasRole,
  COOKIE_NAME,
  verifySessionToken,
} from '@/lib/auth.ts';

const roleForStage = {
  Faculty: 'Faculty',
  HOD: 'HOD',
  Admin: 'Admin',
} as const;

type Decision = 'Approved' | 'Rejected';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the current user.
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Validate the approval ID.
    const { id } = await context.params;
    const approvalId = Number(id);

    if (!Number.isInteger(approvalId) || approvalId < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid approval ID.' },
        { status: 400 }
      );
    }

    // Validate the requested decision.
    const body = await req.json();
    const decision = body.status as Decision;
    const remarks =
      typeof body.remarks === 'string' ? body.remarks.trim() : '';

    if (!['Approved', 'Rejected'].includes(decision)) {
      return NextResponse.json(
        { success: false, error: 'Choose Approved or Rejected.' },
        { status: 400 }
      );
    }

    if (decision === 'Rejected' && !remarks) {
      return NextResponse.json(
        {
          success: false,
          error: 'A remark is required when rejecting.',
        },
        { status: 400 }
      );
    }

    // Fetch the current approval.
    const current = await query(
      `SELECT approval_id, event_id, stage::text AS stage,
              status::text AS status
       FROM approvals
       WHERE approval_id = $1`,
      [approvalId]
    );

    const approval = current.rows[0];

    if (!approval) {
      return NextResponse.json(
        { success: false, error: 'Approval record not found.' },
        { status: 404 }
      );
    }

    // Only the role assigned to this stage can decide it.
    const allowedRole =
      roleForStage[approval.stage as keyof typeof roleForStage];

    if (!allowedRole) {
      return NextResponse.json(
        { success: false, error: 'Unknown approval stage.' },
        { status: 400 }
      );
    }

    try {
      assertUserHasRole(session, [allowedRole]);
    } catch (error) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof error.status === 'number'
          ? error.status
          : 403;

      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error ? error.message : 'Access denied.',
        },
        { status }
      );
    }

    // Prevent a previously decided approval from being changed.
    if (approval.status !== 'Pending') {
      return NextResponse.json(
        {
          success: false,
          error: 'This approval has already been decided.',
        },
        { status: 409 }
      );
    }

    // Require the preceding stage to be approved.
    if (approval.stage === 'HOD' || approval.stage === 'Admin') {
      const previousStage =
        approval.stage === 'HOD' ? 'Faculty' : 'HOD';

      const previous = await query(
        `SELECT status::text AS status
         FROM approvals
         WHERE event_id = $1 AND stage::text = $2`,
        [approval.event_id, previousStage]
      );

      if (previous.rows[0]?.status !== 'Approved') {
        return NextResponse.json(
          {
            success: false,
            error: `The ${previousStage} stage must be approved first.`,
          },
          { status: 409 }
        );
      }
    }

    // Update only if the record is still pending and the prior stage
    // remains approved. The database trigger synchronizes event status.
    const updated = await query(
      `UPDATE approvals AS a
       SET status = $2::approval_status,
           approver_id = $3,
           remarks = $4,
           decided_at = NOW()
       WHERE a.approval_id = $1
         AND a.status = 'Pending'
         AND (
           a.stage::text = 'Faculty'
           OR (
             a.stage::text = 'HOD'
             AND EXISTS (
               SELECT 1
               FROM approvals p
               WHERE p.event_id = a.event_id
                 AND p.stage::text = 'Faculty'
                 AND p.status::text = 'Approved'
             )
           )
           OR (
             a.stage::text = 'Admin'
             AND EXISTS (
               SELECT 1
               FROM approvals p
               WHERE p.event_id = a.event_id
                 AND p.stage::text = 'HOD'
                 AND p.status::text = 'Approved'
             )
           )
         )
       RETURNING approval_id, event_id, stage::text AS stage,
                 status::text AS status, approver_id, remarks, decided_at`,
      [approvalId, decision, session.userId, remarks || null]
    );

    const savedApproval = updated.rows[0];

    if (!savedApproval) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The approval changed or its previous stage is not approved. Refresh and try again.',
        },
        { status: 409 }
      );
    }

    // Record the successful decision in the existing MongoDB audit log.
    // Audit failures are reported but do not undo the saved PostgreSQL decision.
    try {
      const eventResult = await query(
        'SELECT title FROM events WHERE event_id = $1',
        [savedApproval.event_id]
      );

      await logSystemAudit({
        action: 'APPROVAL_DECISION',
        entityType: 'APPROVAL',
        entityId: approvalId,
        actorId: session.userId,
        actorEmail: session.email,
        actorRole: allowedRole,
        details: {
          eventId: savedApproval.event_id,
          eventTitle: eventResult.rows[0]?.title ?? null,
          stage: savedApproval.stage,
          decision: savedApproval.status,
          remarks: savedApproval.remarks,
        },
      });
    } catch (auditError) {
      console.error(
        'Approval was saved, but its audit log could not be written:',
        auditError
      );
    }

    return NextResponse.json({
      success: true,
      message: `Approval ${decision.toLowerCase()} successfully.`,
      approval: savedApproval,
    });
  } catch (error) {
    console.error('Error updating approval:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to update approval.' },
      { status: 500 }
    );
  }
}
