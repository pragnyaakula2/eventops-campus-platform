"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Budget = {
  event_id: number;
  event_title: string;
  event_status: string;
  budget_id: number | null;
  budget_status: string;
  allocated_budget: number | string;
  total_expenses: number | string;
  remaining_balance: number | string;
  budget_utilization_pct: number | string;
  total_sponsorship: number | string;
  net_cost_to_college: number | string;
};

type BudgetResponse = {
  success: boolean;
  count?: number;
  summary?: {
    allocatedBudget: number | string;
    totalExpenses: number | string;
    remainingBalance: number | string;
    totalSponsorship: number | string;
    netCostToCollege: number | string;
  };
  budgets?: Budget[];
  error?: string;
};

const money = (value: number | string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function statusStyle(status: string) {
  switch (status.toLowerCase()) {
    case "approved":
      return "bg-emerald-50 text-emerald-700";
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "rejected":
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] =
    useState<BudgetResponse["summary"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");

  async function loadBudgets() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/budgets", {
        cache: "no-store",
      });

      const data: BudgetResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load budgets.");
      }

      setBudgets(data.budgets || []);
      setSummary(data.summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load budgets."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBudgets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredBudgets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return budgets.filter((budget) => {
      const matchesSearch =
        !query ||
        budget.event_title.toLowerCase().includes(query) ||
        budget.event_status.toLowerCase().includes(query);

      const matchesStatus =
        status === "All" ||
        budget.budget_status.toLowerCase() === status.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [budgets, search, status]);

  const cards = [
    {
      label: "Allocated budget",
      value: summary?.allocatedBudget,
      note: "Total budget assigned",
      color: "bg-indigo-500",
    },
    {
      label: "Total expenses",
      value: summary?.totalExpenses,
      note: "Recorded expenditure",
      color: "bg-rose-500",
    },
    {
      label: "Remaining balance",
      value: summary?.remainingBalance,
      note: "Budget less expenses",
      color: "bg-emerald-500",
    },
    {
      label: "Total sponsorship",
      value: summary?.totalSponsorship,
      note: "Recorded sponsorship funds",
      color: "bg-sky-500",
    },
  ];

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <nav className="mb-8 flex flex-wrap items-center gap-3 text-sm">
          <Link href="/" className="text-slate-500 hover:text-indigo-600">
            Overview
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-indigo-600">Budgets</span>
          <Link
            href="/expenses"
            className="ml-auto font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Manage expenses →
          </Link>
        </nav>

        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">
              EventOps / Financial management
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Budget management
            </h1>
            <p className="mt-2 text-slate-500">
              Monitor event budgets, expenses, sponsorships, and balances.
            </p>
          </div>

          <button
            onClick={() => void loadBudgets()}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh data"}
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <span>{error}</span>
            <button
              onClick={() => void loadBudgets()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>
                <span className={`h-2.5 w-2.5 rounded-full ${card.color}`} />
              </div>
              <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                {loading
                  ? "—"
                  : money(card.value ?? 0)}
              </p>
              <p className="mt-2 text-xs text-slate-500">{card.note}</p>
            </article>
          ))}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Financial overview</h2>
              <p className="mt-1 text-sm text-slate-500">
                Overall expenditure compared with allocated funds
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">
              {loading
                ? "Loading..."
                : `${budgets.length} event budgets`}
            </span>
          </div>

          {!loading && summary && (
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-500">Budget utilization</span>
                <span className="font-semibold">
                  {Number(summary.allocatedBudget) > 0
                    ? (
                        (Number(summary.totalExpenses) /
                          Number(summary.allocatedBudget)) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        Number(summary.allocatedBudget) > 0
                          ? (Number(summary.totalExpenses) /
                              Number(summary.allocatedBudget)) *
                              100
                          : 0
                      )
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {money(summary.totalExpenses)} spent out of{" "}
                {money(summary.allocatedBudget)} allocated.
              </p>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <h2 className="font-bold">Event budget directory</h2>
              <p className="mt-1 text-sm text-slate-500">
                Live financial data from PostgreSQL
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
              {filteredBudgets.length} results
            </span>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
            <input
              aria-label="Search budgets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search event name or status..."
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />

            <select
              aria-label="Filter budget status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="All">All budget statuses</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {loading ? (
            <p className="p-10 text-center text-slate-500">
              Loading budgets from PostgreSQL...
            </p>
          ) : filteredBudgets.length === 0 ? (
            <p className="p-10 text-center text-slate-500">
              No budgets match your search or filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Event</th>
                    <th className="px-5 py-4 font-semibold">Allocated</th>
                    <th className="px-5 py-4 font-semibold">Expenses</th>
                    <th className="px-5 py-4 font-semibold">Balance</th>
                    <th className="px-5 py-4 font-semibold">Utilization</th>
                    <th className="px-5 py-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBudgets.map((budget) => (
                    <tr
                      key={budget.event_id}
                      className="transition hover:bg-slate-50"
                    >
                      <td className="min-w-52 px-5 py-4">
                        <p className="font-semibold">{budget.event_title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Event #{budget.event_id}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium">
                        {money(budget.allocated_budget)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {money(budget.total_expenses)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium">
                        {money(budget.remaining_balance)}
                      </td>
                      <td className="min-w-36 px-5 py-4">
                        <p className="mb-2 text-xs font-semibold">
                          {Number(budget.budget_utilization_pct).toFixed(1)}%
                        </p>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number(budget.budget_utilization_pct) || 0
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(
                            budget.budget_status
                          )}`}
                        >
                          {budget.budget_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
