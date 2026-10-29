
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Resource = {
  resource_id: number;
  resource_name: string;
  resource_type: string;
  total_quantity: number;
  available_quantity: number;
  condition_status: string;
  allocated_quantity: number;
  active_allocations: number;
};

type Allocation = {
  allocation_id: number;
  event_id: number;
  resource_id: number;
  quantity: number;
  allocated_at: string;
  status: string;
  resource_name: string;
  resource_type: string;
  event_title: string;
  start_time: string;
  end_time: string;
};

type EventOption = {
  event_id: number;
  event_title?: string;
  title?: string;
  event_status?: string;
  status?: string;
  start_time?: string;
};

const conditions = [
  "Good",
  "Needs Repair",
  "Under Maintenance",
  "Retired",
];

function conditionStyle(condition: string) {
  switch (condition) {
    case "Good":
      return "bg-emerald-50 text-emerald-700";
    case "Needs Repair":
      return "bg-amber-50 text-amber-700";
    case "Under Maintenance":
      return "bg-orange-50 text-orange-700";
    case "Retired":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatDate(value?: string) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function readResponse(response: Response) {
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "The request failed.");
  }

  return data;
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [activeTab, setActiveTab] = useState<"inventory" | "allocations">(
    "inventory"
  );
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [allocationResource, setAllocationResource] =
    useState<Resource | null>(null);

  const [newResource, setNewResource] = useState({
    resource_name: "",
    resource_type: "Equipment",
    total_quantity: "1",
  });

  const [allocationForm, setAllocationForm] = useState({
    event_id: "",
    quantity: "1",
  });

  const [editForm, setEditForm] = useState({
    resource_name: "",
    resource_type: "",
    total_quantity: "0",
    condition_status: "Good",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [resourceData, allocationData, eventData] = await Promise.all([
        fetch("/api/resources", { cache: "no-store" }).then(readResponse),
        fetch("/api/resources/allocations", { cache: "no-store" }).then(
          readResponse
        ),
        fetch("/api/events", { cache: "no-store" }).then(readResponse),
      ]);

      setResources(resourceData.resources ?? []);
      setAllocations(allocationData.allocations ?? []);

      const rawEvents = eventData.events ?? [];
      setEvents(
        rawEvents.filter((event: EventOption) => {
          const status = String(
            event.event_status ?? event.status ?? ""
          ).toLowerCase();

          return !["cancelled", "completed", "rejected"].includes(status);
        })
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load resource data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const total = resources.reduce(
      (sum, resource) => sum + Number(resource.total_quantity),
      0
    );
    const available = resources.reduce(
      (sum, resource) => sum + Number(resource.available_quantity),
      0
    );

    return {
      resourceTypes: resources.length,
      total,
      available,
      allocated: total - available,
      attention: resources.filter(
        (resource) => resource.condition_status !== "Good"
      ).length,
      activeAllocations: allocations.filter(
        (allocation) => allocation.status === "Allocated"
      ).length,
    };
  }, [resources, allocations]);

  const filteredResources = useMemo(() => {
    const term = search.trim().toLowerCase();

    return resources.filter((resource) => {
      const matchesSearch =
        !term ||
        resource.resource_name.toLowerCase().includes(term) ||
        resource.resource_type.toLowerCase().includes(term) ||
        resource.condition_status.toLowerCase().includes(term);

      const matchesFilter =
        filter === "All" || resource.condition_status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [resources, search, filter]);

  async function createResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await readResponse(
        await fetch("/api/resources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...newResource,
            total_quantity: Number(newResource.total_quantity),
          }),
        })
      );

      setNewResource({
        resource_name: "",
        resource_type: "Equipment",
        total_quantity: "1",
      });
      setShowCreate(false);
      setNotice("Resource added successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add resource."
      );
    } finally {
      setBusy(false);
    }
  }

  function openEdit(resource: Resource) {
    setEditing(resource);
    setEditForm({
      resource_name: resource.resource_name,
      resource_type: resource.resource_type,
      total_quantity: String(resource.total_quantity),
      condition_status: resource.condition_status,
    });
    setError("");
    setNotice("");
  }

  async function saveResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await readResponse(
        await fetch(`/api/resources/${editing.resource_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editForm,
            total_quantity: Number(editForm.total_quantity),
          }),
        })
      );

      setEditing(null);
      setNotice("Resource updated successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update resource."
      );
    } finally {
      setBusy(false);
    }
  }

  function openAllocation(resource: Resource) {
    setAllocationResource(resource);
    setAllocationForm({ event_id: "", quantity: "1" });
    setError("");
    setNotice("");
  }

  async function createAllocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allocationResource) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await readResponse(
        await fetch("/api/resources/allocations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: Number(allocationForm.event_id),
            resource_id: allocationResource.resource_id,
            quantity: Number(allocationForm.quantity),
          }),
        })
      );

      setAllocationResource(null);
      setActiveTab("allocations");
      setNotice("Resource allocated successfully.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not allocate resource."
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeAllocationStatus(
    allocation: Allocation,
    status: "Returned" | "Cancelled"
  ) {
    const action = status === "Returned" ? "return" : "cancel";

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${allocation.resource_name} for ${allocation.event_title}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await readResponse(
        await fetch("/api/resources/allocations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allocation_id: allocation.allocation_id,
            status,
          }),
        })
      );

      setNotice(
        status === "Returned"
          ? "Resource marked as returned."
          : "Allocation cancelled."
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update allocation."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm text-slate-500">
              <a href="/" className="hover:text-indigo-600">
                Overview
              </a>{" "}
              / Resources
            </p>
            <p className="text-sm font-medium text-indigo-600">
              EventOps / Inventory management
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Resources
            </h1>
            <p className="mt-2 text-slate-500">
              Manage campus equipment, inventory, and event allocations.
            </p>
          </div>

          <button
            onClick={() => {
              setError("");
              setNotice("");
              setShowCreate(true);
            }}
            className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            + Add resource
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice("")}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Resource types",
              value: stats.resourceTypes,
              note: "Distinct inventory items",
              color: "bg-indigo-500",
            },
            {
              label: "Total quantity",
              value: stats.total.toLocaleString("en-IN"),
              note: "Units in inventory",
              color: "bg-sky-500",
            },
            {
              label: "Available quantity",
              value: stats.available.toLocaleString("en-IN"),
              note: "Units currently available",
              color: "bg-emerald-500",
            },
            {
              label: "Needs attention",
              value: stats.attention,
              note: "Not in good condition",
              color: "bg-amber-500",
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {stat.label}
                </p>
                <span className={`h-2.5 w-2.5 rounded-full ${stat.color}`} />
              </div>
              <p className="text-3xl font-bold tracking-tight">
                {stat.value}
              </p>
              <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
            </article>
          ))}
        </section>

        <section className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Inventory overview</h2>
            <span className="text-sm text-slate-500">
              {stats.allocated.toLocaleString("en-IN")} units allocated
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{
                width: `${
                  stats.total > 0
                    ? Math.min(100, (stats.allocated / stats.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
          <div className="mt-3 flex justify-between gap-3 text-xs text-slate-500">
            <span>
              {stats.total > 0
                ? `${((stats.allocated / stats.total) * 100).toFixed(1)}% allocated`
                : "No inventory yet"}
            </span>
            <span>
              {stats.available.toLocaleString("en-IN")} units available
            </span>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
            <div>
              <h2 className="font-semibold">Resource management</h2>
              <p className="mt-1 text-sm text-slate-500">
                Live data from PostgreSQL
              </p>
            </div>

            <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab("inventory")}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  activeTab === "inventory"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Inventory
              </button>
              <button
                onClick={() => setActiveTab("allocations")}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  activeTab === "allocations"
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Allocations ({stats.activeAllocations})
              </button>
            </div>
          </div>

          {activeTab === "inventory" ? (
            <>
              <div className="grid gap-3 border-b border-slate-100 p-5 md:grid-cols-[1fr_240px]">
                <input
                  aria-label="Search resources"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, type, or condition..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                />
                <select
                  aria-label="Filter by condition"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="All">All conditions</option>
                  {conditions.map((condition) => (
                    <option key={condition} value={condition}>
                      {condition}
                    </option>
                  ))}
                </select>
              </div>

              {loading ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Loading inventory...
                </div>
              ) : filteredResources.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="font-semibold">No resources found</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Try another search or add a new resource.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredResources.map((resource) => {
                    const unavailable =
                      resource.condition_status !== "Good" ||
                      Number(resource.available_quantity) <= 0;

                    return (
                      <article
                        key={resource.resource_id}
                        className="flex flex-col rounded-2xl border border-slate-200 p-5 transition hover:border-indigo-200 hover:shadow-md"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                              {resource.resource_type}
                            </p>
                            <h3 className="mt-2 break-words text-lg font-bold">
                              {resource.resource_name}
                            </h3>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${conditionStyle(
                              resource.condition_status
                            )}`}
                          >
                            {resource.condition_status}
                          </span>
                        </div>

                        <div className="mb-4 grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-slate-50 p-3">
                            <p className="text-xs text-slate-500">Total</p>
                            <p className="mt-1 text-lg font-bold">
                              {resource.total_quantity}
                            </p>
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-3">
                            <p className="text-xs text-emerald-700">
                              Available
                            </p>
                            <p className="mt-1 text-lg font-bold text-emerald-800">
                              {resource.available_quantity}
                            </p>
                          </div>
                          <div className="rounded-xl bg-indigo-50 p-3">
                            <p className="text-xs text-indigo-700">
                              Allocated
                            </p>
                            <p className="mt-1 text-lg font-bold text-indigo-800">
                              {resource.allocated_quantity}
                            </p>
                          </div>
                        </div>

                        <p className="mb-4 text-xs text-slate-500">
                          {resource.active_allocations} active allocation
                          {resource.active_allocations === 1 ? "" : "s"}
                        </p>

                        {resource.condition_status !== "Good" && (
                          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                            New allocations are disabled until this resource
                            is marked Good.
                          </p>
                        )}

                        <div className="mt-auto flex gap-2 border-t border-slate-100 pt-4">
                          <button
                            onClick={() => openEdit(resource)}
                            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            disabled={unavailable || busy}
                            onClick={() => openAllocation(resource)}
                            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            Allocate
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Loading allocations...
                </div>
              ) : allocations.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  No resource allocations found.
                </div>
              ) : (
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-semibold">Resource</th>
                      <th className="px-5 py-4 font-semibold">Event</th>
                      <th className="px-5 py-4 font-semibold">Quantity</th>
                      <th className="px-5 py-4 font-semibold">Allocated at</th>
                      <th className="px-5 py-4 font-semibold">Status</th>
                      <th className="px-5 py-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocations.map((allocation) => (
                      <tr
                        key={allocation.allocation_id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <p className="font-semibold">
                            {allocation.resource_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {allocation.resource_type}
                          </p>
                        </td>
                        <td className="max-w-64 px-5 py-4">
                          <p className="font-medium">
                            {allocation.event_title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(allocation.start_time)}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {allocation.quantity}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {formatDate(allocation.allocated_at)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              allocation.status === "Allocated"
                                ? "bg-indigo-50 text-indigo-700"
                                : allocation.status === "Returned"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {allocation.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {allocation.status === "Allocated" ? (
                            <div className="flex gap-2">
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void changeAllocationStatus(
                                    allocation,
                                    "Returned"
                                  )
                                }
                                className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                Return
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void changeAllocationStatus(
                                    allocation,
                                    "Cancelled"
                                  )
                                }
                                className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              No actions
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

        <p className="mt-5 text-center text-xs text-slate-400">
          Inventory and allocation records are loaded from your PostgreSQL
          database.
        </p>
      </div>

      {(showCreate || editing || allocationResource) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setShowCreate(false);
              setEditing(null);
              setAllocationResource(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-dialog-title"
            className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="resource-dialog-title"
                  className="text-xl font-bold"
                >
                  {showCreate
                    ? "Add resource"
                    : editing
                      ? "Edit resource"
                      : "Allocate resource"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {showCreate
                    ? "Add an item to campus inventory."
                    : editing
                      ? "Update resource details and condition."
                      : `Allocate ${allocationResource?.resource_name} to an event.`}
                </p>
              </div>
              <button
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => {
                  setShowCreate(false);
                  setEditing(null);
                  setAllocationResource(null);
                }}
                className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {showCreate && (
              <form onSubmit={createResource} className="space-y-4">
                <label className="block text-sm font-medium">
                  Resource name
                  <input
                    required
                    maxLength={100}
                    value={newResource.resource_name}
                    onChange={(event) =>
                      setNewResource({
                        ...newResource,
                        resource_name: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                    placeholder="e.g. Portable Speaker"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Resource type
                  <input
                    required
                    maxLength={40}
                    value={newResource.resource_type}
                    onChange={(event) =>
                      setNewResource({
                        ...newResource,
                        resource_type: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                    placeholder="Equipment, Furniture..."
                  />
                </label>

                <label className="block text-sm font-medium">
                  Total quantity
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={newResource.total_quantity}
                    onChange={(event) =>
                      setNewResource({
                        ...newResource,
                        total_quantity: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  />
                </label>

                <button
                  disabled={busy}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Create resource"}
                </button>
              </form>
            )}

            {editing && (
              <form onSubmit={saveResource} className="space-y-4">
                <label className="block text-sm font-medium">
                  Resource name
                  <input
                    required
                    maxLength={100}
                    value={editForm.resource_name}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        resource_name: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Resource type
                  <input
                    required
                    maxLength={40}
                    value={editForm.resource_type}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        resource_type: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  />
                </label>

                <label className="block text-sm font-medium">
                  Total quantity
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.total_quantity}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        total_quantity: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Cannot be less than the quantity currently allocated.
                  </span>
                </label>

                <label className="block text-sm font-medium">
                  Condition
                  <select
                    value={editForm.condition_status}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        condition_status: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  >
                    {conditions.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  disabled={busy}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Save changes"}
                </button>
              </form>
            )}

            {allocationResource && (
              <form onSubmit={createAllocation} className="space-y-4">
                <div className="rounded-xl bg-indigo-50 p-4 text-sm">
                  <p className="font-semibold text-indigo-900">
                    {allocationResource.resource_name}
                  </p>
                  <p className="mt-1 text-indigo-700">
                    {allocationResource.available_quantity} units available
                  </p>
                </div>

                <label className="block text-sm font-medium">
                  Event
                  <select
                    required
                    value={allocationForm.event_id}
                    onChange={(event) =>
                      setAllocationForm({
                        ...allocationForm,
                        event_id: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  >
                    <option value="">Select an event</option>
                    {events.map((event) => (
                      <option key={event.event_id} value={event.event_id}>
                        {event.event_title ??
                          event.title ??
                          `Event #${event.event_id}`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium">
                  Quantity
                  <input
                    required
                    type="number"
                    min="1"
                    max={allocationResource.available_quantity}
                    step="1"
                    value={allocationForm.quantity}
                    onChange={(event) =>
                      setAllocationForm({
                        ...allocationForm,
                        quantity: event.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400"
                  />
                </label>

                <button
                  disabled={
                    busy ||
                    !allocationForm.event_id ||
                    Number(allocationForm.quantity) < 1 ||
                    Number(allocationForm.quantity) >
                      allocationResource.available_quantity
                  }
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {busy ? "Allocating..." : "Confirm allocation"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

