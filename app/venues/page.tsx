
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Venue = {
  venue_id: number;
  venue_name: string;
  building: string;
  capacity: number;
  venue_type: string;
  is_active: boolean;
  booking_count: number;
  upcoming_booking_count: number;
};

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadVenues() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (active !== "all") params.set("active", active);

        const response = await fetch(
          `/api/venues?${params.toString()}`,
          { cache: "no-store" }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to load venues.");
        }

        if (!cancelled) setVenues(data.venues || []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load venues."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = window.setTimeout(loadVenues, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, active]);

  const totalCapacity = venues.reduce(
    (sum, venue) => sum + Number(venue.capacity || 0),
    0
  );

  const upcomingBookings = venues.reduce(
    (sum, venue) => sum + Number(venue.upcoming_booking_count || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <nav className="mb-8 flex flex-wrap gap-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-indigo-600">
            Overview
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-indigo-600">Venues</span>
          <Link
            href="/schedule"
            className="ml-auto font-semibold text-indigo-600 hover:text-indigo-800"
          >
            View schedule →
          </Link>
        </nav>

        <header className="mb-8">
          <p className="text-sm text-slate-500">
            EventOps / Venue management
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Campus venues
          </h1>
          <p className="mt-2 text-slate-500">
            Browse campus spaces, capacities, and booking activity.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Venues shown</p>
            <p className="mt-2 text-3xl font-bold">
              {loading ? "—" : venues.length}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Combined capacity</p>
            <p className="mt-2 text-3xl font-bold">
              {loading ? "—" : totalCapacity.toLocaleString("en-IN")}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Upcoming bookings</p>
            <p className="mt-2 text-3xl font-bold">
              {loading ? "—" : upcomingBookings}
            </p>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="font-bold">Venue directory</h2>
              <p className="mt-1 text-sm text-slate-500">
                Live data from PostgreSQL
              </p>
            </div>

            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
              {loading ? "Loading..." : `${venues.length} venues`}
            </span>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-[1fr_200px]">
            <input
              aria-label="Search venues"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search venue, building, or type..."
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <select
              aria-label="Filter venue status"
              value={active}
              onChange={(e) => setActive(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">All venues</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
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
              Loading venues...
            </p>
          ) : venues.length === 0 ? (
            <p className="p-8 text-center text-slate-500">
              No venues match your filters.
            </p>
          ) : (
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {venues.map((venue) => (
                <article
                  key={venue.venue_id}
                  className="rounded-xl border border-slate-200 p-5 transition hover:border-indigo-200 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        {venue.venue_type}
                      </p>
                      <h3 className="mt-1 text-lg font-bold">
                        {venue.venue_name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {venue.building}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        venue.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {venue.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-xs text-slate-500">Capacity</p>
                      <p className="mt-1 text-2xl font-bold">
                        {Number(venue.capacity).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">
                        Upcoming bookings
                      </p>
                      <p className="mt-1 text-2xl font-bold">
                        {venue.upcoming_booking_count}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-slate-400">
                    {venue.booking_count} non-cancelled booking(s) in total
                  </p>
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

