
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Booking = {
  booking_id: number;
  venue_id: number;
  venue_name: string;
  building: string;
  venue_capacity: number;
  event_id: number;
  event_title: string;
  event_status: string;
  booking_status: string;
  start_time: string;
  end_time: string;
  duration_hours: number | string;
  booked_at: string;
};

type Venue = {
  venue_id: number;
  venue_name: string;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function statusStyle(status: string) {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-700";
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "cancelled":
    case "rejected":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function SchedulePage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [venueId, setVenueId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/venues", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.venues)) {
          setVenues(data.venues);
        }
      })
      .catch((err) => console.error("Unable to load venues:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();

        if (search.trim()) params.set("search", search.trim());
        if (status !== "all") params.set("status", status);
        if (venueId !== "all") params.set("venue_id", venueId);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const response = await fetch(
          `/api/schedule?${params.toString()}`,
          { cache: "no-store" }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to load schedule.");
        }

        if (!cancelled) {
          setBookings(data.bookings || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load schedule."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = window.setTimeout(loadSchedule, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, status, venueId, from, to]);

  const confirmed = bookings.filter(
    (b) => b.booking_status.toLowerCase() === "confirmed"
  ).length;

  const pending = bookings.filter(
    (b) => b.booking_status.toLowerCase() === "pending"
  ).length;

  const scheduledHours = bookings.reduce((sum, booking) => {
    if (
      ["cancelled", "rejected"].includes(
        booking.booking_status.toLowerCase()
      )
    ) {
      return sum;
    }

    return sum + Number(booking.duration_hours || 0);
  }, 0);

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setVenueId("all");
    setFrom("");
    setTo("");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <nav className="mb-8 flex flex-wrap gap-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-indigo-600">
            Overview
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            href="/venues"
            className="text-slate-500 hover:text-indigo-600"
          >
            Venues
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-indigo-600">Schedule</span>
        </nav>

        <header className="mb-8">
          <p className="text-sm text-slate-500">
            EventOps / Venue management
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Venue schedule
          </h1>
          <p className="mt-2 text-slate-500">
            Review bookings, event timings, and venue allocations.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Bookings shown",
              value: bookings.length,
              note: "Matching current filters",
            },
            {
              label: "Confirmed",
              value: confirmed,
              note: "Confirmed venue bookings",
            },
            {
              label: "Pending",
              value: pending,
              note: "Awaiting a decision",
            },
            {
              label: "Scheduled hours",
              value: `${scheduledHours.toLocaleString("en-IN", {
                maximumFractionDigits: 1,
              })} h`,
              note: "Excludes cancelled and rejected",
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold">
                {loading ? "—" : stat.value}
              </p>
              <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="font-bold">Booking calendar</h2>
              <p className="mt-1 text-sm text-slate-500">
                Live data from PostgreSQL
              </p>
            </div>

            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
              {loading ? "Loading..." : `${bookings.length} results`}
            </span>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-3">
            <input
              aria-label="Search schedule"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event, venue, or building..."
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <select
              aria-label="Filter booking status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">All booking statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              aria-label="Filter venue"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">All venues</option>
              {venues.map((venue) => (
                <option key={venue.venue_id} value={venue.venue_id}>
                  {venue.venue_name}
                </option>
              ))}
            </select>

            <label className="text-xs text-slate-500">
              From date
              <input
                aria-label="From date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <label className="text-xs text-slate-500">
              To date
              <input
                aria-label="To date"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              />
            </label>

            <button
              onClick={clearFilters}
              className="self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className="p-8 text-center text-slate-500">
              Loading schedule...
            </p>
          ) : bookings.length === 0 ? (
            <p className="p-8 text-center text-slate-500">
              No bookings match your filters.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {bookings.map((booking) => (
                <article
                  key={booking.booking_id}
                  className="grid gap-4 p-5 transition hover:bg-slate-50 md:grid-cols-[170px_minmax(0,1fr)]"
                >
                  <div className="rounded-xl bg-indigo-50 p-4">
                    <p className="text-sm font-bold text-indigo-900">
                      {formatDate(booking.start_time)}
                    </p>
                    <p className="mt-2 text-sm text-indigo-700">
                      {formatTime(booking.start_time)}
                    </p>
                    <p className="text-sm text-indigo-700">
                      to {formatTime(booking.end_time)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{booking.event_title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(
                          booking.booking_status
                        )}`}
                      >
                        {booking.booking_status}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-600">
                      {booking.venue_name} · {booking.building}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                      <span>Event status: {booking.event_status}</span>
                      <span>
                        Capacity:{" "}
                        {Number(booking.venue_capacity).toLocaleString("en-IN")}
                      </span>
                      <span>
                        Duration: {Number(booking.duration_hours)} hours
                      </span>
                      <span>Booking #{booking.booking_id}</span>
                    </div>

                    <p className="mt-3 text-xs text-slate-400">
                      Booking created: {formatDate(booking.booked_at)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          EventOps · College Event Operations Management System
        </footer>
      </div>
    </main>
  );
}

