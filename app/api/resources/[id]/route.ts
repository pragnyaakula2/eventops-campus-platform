
import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";

const conditions = [
  "Good",
  "Needs Repair",
  "Under Maintenance",
  "Retired",
];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = await getClient();

  try {
    const { id } = await context.params;
    const resourceId = Number(id);
    const body = await request.json();

    if (!Number.isSafeInteger(resourceId) || resourceId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid resource ID." },
        { status: 400 }
      );
    }

    const name = String(body.resource_name ?? "").trim();
    const type = String(body.resource_type ?? "").trim();
    const total = Number(body.total_quantity);
    const condition = body.condition_status;

    if (
      !name || name.length > 100 ||
      !type || type.length > 40 ||
      !Number.isSafeInteger(total) || total < 0 ||
      !conditions.includes(condition)
    ) {
      return NextResponse.json(
        { success: false, error: "Check the resource name, type, quantity, and condition." },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT resource_id
       FROM resources
       WHERE resource_id = $1
       FOR UPDATE`,
      [resourceId]
    );

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, error: "Resource not found." },
        { status: 404 }
      );
    }

    const active = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS quantity
       FROM resource_allocations
       WHERE resource_id = $1 AND status = 'Allocated'`,
      [resourceId]
    );

    const allocated = Number(active.rows[0].quantity);

    if (total < allocated) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          error: `Total quantity cannot be less than ${allocated}, which is currently allocated.`,
        },
        { status: 400 }
      );
    }

    const updated = await client.query(
      `UPDATE resources
       SET resource_name = $1,
           resource_type = $2,
           total_quantity = $3,
           available_quantity = $3 - $4,
           condition_status = $5
       WHERE resource_id = $6
       RETURNING resource_id, resource_name, resource_type,
                 total_quantity, available_quantity, condition_status`,
      [name, type, total, allocated, condition, resourceId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      resource: updated.rows[0],
    });
  } catch (caught: unknown) {
    const error = caught as Error & { status?: number; code?: string };
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (error.code === "23505") {
      return NextResponse.json(
        { success: false, error: "Another resource already uses this name." },
        { status: 409 }
      );
    }

    console.error("PATCH /api/resources/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update resource." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

