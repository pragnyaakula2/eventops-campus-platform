import { connection } from 'next/server';

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";


export async function GET(req: NextRequest) {
  await connection();
  try {
    const params = new URL(req.url).searchParams;
    const search = (params.get("search") || "").trim();
    const active = params.get("active") || "all";

    const values: (string | boolean)[] = [];
    const conditions: string[] = [];

    if (search) {
      values.push(`%${search}%`);
      const n = values.length;
      conditions.push(
        `(v.venue_name ILIKE $${n}
          OR v.building ILIKE $${n}
          OR v.venue_type ILIKE $${n})`
      );
    }

    if (active === "active" || active === "inactive") {
      values.push(active === "active");
      conditions.push(`v.is_active = $${values.length}`);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await query(
      `SELECT
         v.venue_id,
         v.venue_name,
         v.building,
         v.capacity,
         v.venue_type,
         v.is_active,
         COUNT(vb.booking_id) FILTER (
           WHERE LOWER(vb.status::text)
             NOT IN ('cancelled', 'rejected')
         )::int AS booking_count,
         COUNT(vb.booking_id) FILTER (
           WHERE LOWER(vb.status::text)
             NOT IN ('cancelled', 'rejected')
             AND upper(vb.booking_period) >= NOW()
         )::int AS upcoming_booking_count
       FROM venues v
       LEFT JOIN venue_bookings vb
         ON vb.venue_id = v.venue_id
       ${where}
       GROUP BY
         v.venue_id,
         v.venue_name,
         v.building,
         v.capacity,
         v.venue_type,
         v.is_active
       ORDER BY v.is_active DESC, v.venue_name ASC`,
      values
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      venues: result.rows,
    });
  } catch (error) {
    console.error("Error fetching venues:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load venues",
      },
      { status: 500 }
    );
  }
}

