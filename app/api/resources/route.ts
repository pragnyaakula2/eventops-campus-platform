
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(`
      SELECT
        r.resource_id,
        r.resource_name,
        r.resource_type,
        r.total_quantity,
        r.available_quantity,
        r.condition_status,
        r.total_quantity - r.available_quantity AS allocated_quantity,
        COALESCE(a.active_allocations, 0)::int AS active_allocations
      FROM resources r
      LEFT JOIN (
        SELECT resource_id, COUNT(*) AS active_allocations
        FROM resource_allocations
        WHERE status = 'Allocated'
        GROUP BY resource_id
      ) a ON a.resource_id = r.resource_id
      ORDER BY r.resource_name ASC
    `);

    const resources = result.rows;
    const totalQuantity = resources.reduce(
      (sum, r) => sum + Number(r.total_quantity), 0
    );
    const availableQuantity = resources.reduce(
      (sum, r) => sum + Number(r.available_quantity), 0
    );

    return NextResponse.json({
      success: true,
      resources,
      stats: {
        resourceTypes: resources.length,
        totalQuantity,
        availableQuantity,
        allocatedQuantity: totalQuantity - availableQuantity,
        needsAttention: resources.filter(
          (r) => r.condition_status !== "Good"
        ).length,
      },
    });
  } catch (error) {
    console.error("GET /api/resources:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load resources." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.resource_name ?? "").trim();
    const type = String(body.resource_type ?? "").trim();
    const quantity = Number(body.total_quantity);

    if (!name || !type || name.length > 100 || type.length > 40) {
      return NextResponse.json(
        { success: false, error: "Enter a valid resource name and type." },
        { status: 400 }
      );
    }

    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      return NextResponse.json(
        { success: false, error: "Quantity must be a non-negative whole number." },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO resources
        (resource_name, resource_type, total_quantity, available_quantity)
       VALUES ($1, $2, $3, $3)
       RETURNING resource_id, resource_name, resource_type,
                 total_quantity, available_quantity, condition_status`,
      [name, type, quantity]
    );

    return NextResponse.json(
      { success: true, resource: result.rows[0] },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json(
        { success: false, error: "A resource with this name already exists." },
        { status: 409 }
      );
    }

    console.error("POST /api/resources:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create resource." },
      { status: 500 }
    );
  }
}


