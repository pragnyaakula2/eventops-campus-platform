
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(`
      SELECT
        ra.allocation_id,
        ra.event_id,
        ra.resource_id,
        ra.quantity,
        ra.allocated_at,
        ra.status,
        r.resource_name,
        r.resource_type,
        e.title AS event_title,
        e.start_time,
        e.end_time
      FROM resource_allocations ra
      JOIN resources r ON r.resource_id = ra.resource_id
      JOIN events e ON e.event_id = ra.event_id
      ORDER BY
        CASE WHEN ra.status = 'Allocated' THEN 0 ELSE 1 END,
        ra.allocated_at DESC
    `);

    return NextResponse.json({
      success: true,
      allocations: result.rows,
    });
  } catch (error) {
    console.error("GET resource allocations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load allocations." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = Number(body.event_id);
    const resourceId = Number(body.resource_id);
    const quantity = Number(body.quantity);

    if (
      !Number.isSafeInteger(eventId) || eventId <= 0 ||
      !Number.isSafeInteger(resourceId) || resourceId <= 0 ||
      !Number.isSafeInteger(quantity) || quantity <= 0
    ) {
      return NextResponse.json(
        { success: false, error: "Choose an event, a resource, and a positive whole-number quantity." },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO resource_allocations
        (event_id, resource_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING allocation_id, event_id, resource_id,
                 quantity, allocated_at, status`,
      [eventId, resourceId, quantity]
    );

    return NextResponse.json(
      { success: true, allocation: result.rows[0] },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST resource allocation:", error);

    if (error.code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error: "This event already has an allocation for that resource. Update the existing allocation instead.",
        },
        { status: 409 }
      );
    }

    if (error.code === "23503") {
      return NextResponse.json(
        { success: false, error: "The selected event or resource does not exist." },
        { status: 400 }
      );
    }

    if (error.code === "23514" || error.code === "P0001") {
      return NextResponse.json(
        {
          success: false,
          error: "The allocation was rejected. Check available quantity and resource condition.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unable to allocate resource.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const allocationId = Number(body.allocation_id);
    const status = body.status;

    if (
      !Number.isSafeInteger(allocationId) ||
      allocationId <= 0 ||
      !["Returned", "Cancelled"].includes(status)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid allocation ID or status." },
        { status: 400 }
      );
    }

    const result = await query(
      `UPDATE resource_allocations
       SET status = $1
       WHERE allocation_id = $2
         AND status = 'Allocated'
       RETURNING allocation_id, status`,
      [status, allocationId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Allocation not found or it is no longer active.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      allocation: result.rows[0],
    });
  } catch (error: any) {
    console.error("PATCH resource allocation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update allocation status." },
      { status: 500 }
    );
  }
}

