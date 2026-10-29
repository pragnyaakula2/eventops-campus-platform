
"use client";

import { useEffect, useMemo, useState } from "react";

type EventItem = {
  event_id: number;
  event_title: string;
  event_status: string;
  start_time: string;
  end_time?: string;
  category_name?: string | null;
  organizer_name?: string | null;
  venue_names?: string[] | string | null;
  capacity?: number;
  confirmed_registrations?: number;
  waitlist_count?: number;
  seats_remaining?: number;
  occupancy_percentage?: number;
  is_full?: boolean;
};

type EventsResponse = {
  success: boolean;
  count?: number;
  events?: EventItem[];
  error?: string;
};


const navigation = [
  { icon: "▦", label: "Overview", href: "/" },
  { icon: "◉", label: "Events", href: "/#campus-events" },
  {
    icon: "♧",
    label: "Registrations",
    href: "/student/registrations",
  },
  { icon: "▤", label: "Venues", href: "/venues" },
  { icon: "◷", label: "Schedule", href: "/schedule" },
  { icon: "◇", label: "Resources", href: "/resources" },
  { icon: "⇄", label: "Budgets", href: "/budgets" },
  { icon: "✓", label: "Approvals", href: "/approvals" },
  
];


function formatDate(value?: string) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusStyle(status: string) {
  switch (status.toLowerCase()) {
    case "approved":
      return "bg-emerald-50 text-emerald-700";
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "completed":
      return "bg-sky-50 text-sky-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getVenueNames(value?: string[] | string | null) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "Venue not assigned";
  }

  return value || "Venue not assigned";
}

export default function Home() {
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEvents() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/events", {
          cache: "no-store",
        });

        const rawData = await response.json();

        // Support either a normal JSON object or an array containing one.
        const data: EventsResponse = Array.isArray(rawData)
          ? rawData[0]
          : rawData;

        if (
          !response.ok ||
          !data?.success ||
          !Array.isArray(data.events)
        ) {
          throw new Error(
            data?.error || "Unable to load events from the API."
          );
        }

        if (active) {
          setEvents(data.events);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong while loading events."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    // Read the current time in the browser, not during prerendering.
    const timer = window.setTimeout(() => {
      setCurrentTime(Date.now());
      void loadEvents();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const stats = useMemo(() => {
    const upcoming = events.filter((event) => {
      const start = new Date(event.start_time).getTime();

      return (
        currentTime !== null &&
        Number.isFinite(start) &&
        start >= currentTime &&
        event.event_status.toLowerCase() !== "cancelled"
      );
    });

    const pending = events.filter(
      (event) => event.event_status.toLowerCase() === "pending"
    );

    const registrations = events.reduce(
      (total, event) =>
        total + Number(event.confirmed_registrations || 0),
      0
    );

    return [
      {
        label: "Total Events",
        value: String(events.length),
        note: "Events returned by the database",
        dot: "bg-indigo-500",
      },
      {
        label: "Registrations",
        value: registrations.toLocaleString("en-IN"),
        note: "Confirmed registrations across listed events",
        dot: "bg-emerald-500",
      },
      {
        label: "Upcoming Events",
        value: currentTime === null ? "—" : String(upcoming.length),
        note: "Scheduled from today onward",
        dot: "bg-sky-500",
      },
      {
        label: "Pending Approvals",
        value: String(pending.length),
        note: "Events with pending status",
        dot: "bg-amber-500",
      },
    ];
  }, [events, currentTime]);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return events.filter((event) => {
      const matchesSearch =
        !query ||
        event.event_title.toLowerCase().includes(query) ||
        (event.category_name || "").toLowerCase().includes(query) ||
        (event.organizer_name || "").toLowerCase().includes(query) ||
        getVenueNames(event.venue_names).toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "All" ||
        event.event_status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [events, search, statusFilter]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-900 md:flex">
      <aside className="flex w-full flex-col bg-[#111827] p-5 text-white md:min-h-screen md:w-64 md:shrink-0">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold">
            E
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">EventOps</h1>
            <p className="text-xs text-slate-400">Campus management</p>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workspace
        </p>

        <nav className="flex flex-wrap gap-2 md:flex-col">
          {navigation.map((item, index) => (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                index === 0
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 rounded-xl border border-slate-700 bg-slate-800/60 p-4 md:mt-auto">
          <p className="text-sm font-semibold">Event operations</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Your campus activities in one workspace.
          </p>
        </div>
      </aside>

      <section className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-slate-500">Campus / Overview</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Event operations
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Your campus activity at a glance.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
              E
            </div>
            <div>
              <p className="text-sm font-semibold">EventOps</p>
              <p className="text-xs text-slate-500">
                {loading ? "Loading events..." : `${events.length} events loaded`}
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <span>Unable to load live event data: {error}</span>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-red-300 px-3 py-2 font-semibold hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {stat.label}
                </p>
                <span className={`h-2.5 w-2.5 rounded-full ${stat.dot}`} />
              </div>
              <p className="text-3xl font-bold tracking-tight">
                {loading ? "—" : stat.value}
              </p>
              <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <section
            id="campus-events"
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h3 className="font-bold">Campus events</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Live data from your EventOps API
                </p>
              </div>
              <span className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                {loading ? "Loading..." : `${filteredEvents.length} results`}
              </span>
            </div>

            <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
              <input
                aria-label="Search events"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, category, venue..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />

              <select
                aria-label="Filter by event status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              >
                <option value="All">All statuses</option>
                <option value="Approved">Approved</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Draft">Draft</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Registrations</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {loading &&
                    [1, 2, 3].map((row) => (
                      <tr key={row}>
                        <td colSpan={4} className="px-5 py-5">
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))}

                  {!loading && !error && filteredEvents.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-12 text-center text-slate-500"
                      >
                        No events match your search or selected filter.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filteredEvents.map((event) => (
                      <tr
                        key={event.event_id}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <p className="min-w-40 font-semibold">
                            {event.event_title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {event.category_name || "Uncategorized"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {getVenueNames(event.venue_names)}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {formatDate(event.start_time)}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {Number(event.confirmed_registrations || 0)}
                          {event.capacity != null && ` / ${event.capacity}`}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusStyle(event.event_status)}`}
                          >
                            {event.event_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            id="quick-actions"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="font-bold">Quick actions</h3>
            <p className="mt-1 text-sm text-slate-500">
              Explore the available event data.
            </p>

            <div className="mt-5 space-y-3">
              <button
                onClick={() => {
                  document
                    .getElementById("campus-events")
                    ?.scrollIntoView({ behavior: "smooth" });

                  document
                    .querySelector<HTMLInputElement>(
                      'input[aria-label="Search events"]'
                    )
                    ?.focus();
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-lg text-indigo-700">
                  ⌕
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    Find an event
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Search titles, categories and venues
                  </span>
                </span>
              </button>

              <a
                href="#campus-events"
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
                  ◷
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    Browse campus events
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    View dates, venues and registration counts
                  </span>
                </span>
              </a>

              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="text-sm font-semibold">More operations</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Event creation, approvals, venue booking and budget
                  management will be connected to their authorized workflows
                  in the next implementation stage.
                </p>
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-400">
          EventOps · College Event Operations Management System
        </footer>
      </section>
    </main>
  );
}
