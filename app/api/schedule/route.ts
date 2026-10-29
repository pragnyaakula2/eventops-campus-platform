import { connection } from 'next/server';

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";


export async function GET(req: NextRequest) {
  await connection();
  try {
    const params = new URL(req.url).searchParams;

    const search = (params.get("search") || "").trim();
    const status = (params.get("status") || "all").trim();
    const venueId = params.get("venue_id");
    const from = params.get("from");
    const to = params.get("to");

    const values: (string | number)[] = [];
    const conditions: string[] = [];

    if (search) {
      values.push(`%${search}%`);
      const n = values.length;

      conditions.push(
        `(event_title ILIKE $${n}
          OR venue_name ILIKE $${n}
          OR building ILIKE $${n})`
      );
    }

    if (status.toLowerCase() !== "all") {
      values.push(status);
      conditions.push(
        `booking_status::text ILIKE $${values.length}`
      );
    }

    if (venueId && Number.isInteger(Number(venueId))) {
      values.push(Number(venueId));
      conditions.push(`venue_id = $${values.length}`);
    }

    if (from) {
      values.push(from);
      conditions.push(`end_time >= $${values.length}::date`);
    }

    if (to) {
      values.push(to);
      conditions.push(
        `start_time < ($${values.length}::date + INTERVAL '1 day')`
      );
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const result = await query(
      `SELECT
         booking_id,
         venue_id,
         venue_name,
         building,
         venue_capacity,
         event_id,
         event_title,
         event_status::text AS event_status,
         booking_status::text AS booking_status,
         start_time,
         end_time,
         duration_hours,
         booked_at
       FROM vw_venue_utilization_calendar
       ${where}
       ORDER BY start_time ASC`,
      values
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      bookings: result.rows,
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load schedule",
      },
      { status: 500 }
    );
  }
}

