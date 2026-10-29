
"use client";

import { useEffect, useState } from "react";

type Registration = {
  registration_id?: number;
  event_id?: number;
  event_title?: string;
  title?: string;
  status?: string;
  registration_date?: string;
  registered_at?: string;
  start_time?: string;
};

export default function RegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRegistrations() {
      try {
        const response = await fetch("/api/student/registrations", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
          throw new Error(
            data.error || "Could not load registrations."
          );
        }

        const items = Array.isArray(data)
          ? data
          : data.registrations ?? data.events ?? data.data ?? [];

        setRegistrations(items);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    loadRegistrations();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <a
          href="/"
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          ← Back to dashboard
        </a>

        <header className="mb-8 mt-5">
          <p className="text-sm text-slate-500">
            EventOps / Student Portal
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            My Registrations
          </h1>
          <p className="mt-2 text-slate-600">
            View your campus event registrations and their status.
          </p>
        </header>

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-slate-600">
            Loading registrations...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <h2 className="font-semibold text-red-700">
              Unable to load registrations
            </h2>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <p className="mt-3 text-sm text-slate-500">
              Make sure you are signed in with a valid student account.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white"
            >
              Try again
            </button>
          </div>
        ) : registrations.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">
              No registrations found
            </h2>
            <p className="mt-2 text-slate-600">
              Your account does not have any registrations to display.
            </p>
            <a
              href="/#campus-events"
              className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-white"
            >
              Browse events
            </a>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b p-5">
              <p className="font-medium text-slate-900">
                {registrations.length} registration
                {registrations.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {registrations.map((registration, index) => (
                <article
                  key={
                    registration.registration_id ??
                    `${registration.event_id}-${index}`
                  }
                  className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center"
                >
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      {registration.event_title ??
                        registration.title ??
                        `Event #${registration.event_id ?? "Unknown"}`}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {registration.registered_at ??
                        registration.registration_date ??
                        ""}
                    </p>
                  </div>

                  <span className="inline-flex w-fit rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium capitalize text-indigo-700">
                    {registration.status ?? "Registered"}
                  </span>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
