
'use client';

import { useCallback, useEffect, useState } from 'react';

type Approval = {
  approval_id: number;
  event_id: number;
  event_title: string;
  event_status: string;
  stage: 'Faculty' | 'HOD' | 'Admin';
  status: 'Pending' | 'Approved' | 'Rejected';
  approver_id: number | null;
  approver_name: string | null;
  remarks: string | null;
  decided_at: string | null;
};

type CurrentUser = {
  userId: number;
  fullName: string;
  roleName: string;
};

const stageOrder = ['Faculty', 'HOD', 'Admin'];

const statusStyles: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState('All');

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/approvals', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to load approvals.');
      }

      setApprovals(data.approvals);
      setCurrentUser(data.currentUser);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load approvals.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  async function decide(approval: Approval, decision: 'Approved' | 'Rejected') {
    const remark = (remarks[approval.approval_id] || '').trim();

    if (decision === 'Rejected' && !remark) {
      setError('Please enter a reason before rejecting an approval.');
      return;
    }

    setBusyId(approval.approval_id);
    setError('');

    try {
      const response = await fetch(`/api/approvals/${approval.approval_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision, remarks: remark }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to update approval.');
      }

      await loadApprovals();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update approval.'
      );
    } finally {
      setBusyId(null);
    }
  }

  const visibleApprovals =
    filter === 'All'
      ? approvals
      : approvals.filter((approval) => approval.status === filter);

  const pendingCount = approvals.filter(
    (approval) => approval.status === 'Pending'
  ).length;

  const approvedCount = approvals.filter(
    (approval) => approval.status === 'Approved'
  ).length;

  const rejectedCount = approvals.filter(
    (approval) => approval.status === 'Rejected'
  ).length;

  function canDecide(approval: Approval) {
    if (!currentUser || approval.status !== 'Pending') return false;

    const roleMatches = currentUser.roleName === approval.stage;
    if (!roleMatches) return false;

    const position = stageOrder.indexOf(approval.stage);
    if (position <= 0) return true;

    const previousStage = stageOrder[position - 1];
    const previousApproval = approvals.find(
      (item) =>
        item.event_id === approval.event_id &&
        item.stage === previousStage
    );

    return previousApproval?.status === 'Approved';
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/"
              className="mb-3 inline-flex text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              ← Back to dashboard
            </a>
            <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
            <p className="mt-2 text-sm text-slate-500">
              Review event requests through Faculty, HOD, and Admin approval.
            </p>
            {currentUser && (
              <p className="mt-2 text-sm text-slate-600">
                Signed in as <strong>{currentUser.fullName}</strong>
                {' · '}
                Role: <strong>{currentUser.roleName}</strong>
              </p>
            )}
          </div>

          <button
            onClick={() => void loadApprovals()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-slate-100 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: 'Pending decisions',
              value: pendingCount,
              color: 'text-amber-700',
            },
            {
              label: 'Approved stages',
              value: approvedCount,
              color: 'text-emerald-700',
            },
            {
              label: 'Rejected stages',
              value: rejectedCount,
              color: 'text-rose-700',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className={`mt-2 text-3xl font-bold ${item.color}`}>
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <h2 className="font-semibold">Event approval records</h2>
              <p className="mt-1 text-sm text-slate-500">
                Decisions are restricted to the signed-in user&apos;s role.
              </p>
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="Filter approvals by status"
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Loading approval records…
            </div>
          ) : visibleApprovals.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No approval records match this filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleApprovals.map((approval) => {
                const actionable = canDecide(approval);
                const isBusy = busyId === approval.approval_id;

                return (
                  <article
                    key={approval.approval_id}
                    className="p-5 transition hover:bg-slate-50/70"
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            {approval.event_title}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                              statusStyles[approval.status] ||
                              'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {approval.status}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                          <span>Event #{approval.event_id}</span>
                          <span>Stage: {approval.stage}</span>
                          <span>Event status: {approval.event_status}</span>
                        </div>

                        <div className="mt-3 text-sm">
                          <span className="text-slate-500">Decision by: </span>
                          <span className="font-medium">
                            {approval.approver_name || 'Not decided'}
                          </span>
                        </div>

                        {approval.remarks && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                            <span className="font-medium">Remarks: </span>
                            {approval.remarks}
                          </p>
                        )}

                        {approval.decided_at && (
                          <p className="mt-1 text-xs text-slate-400">
                            Decided{' '}
                            {new Date(approval.decided_at).toLocaleString()}
                          </p>
                        )}

                        {approval.status === 'Pending' && !actionable && (
                          <p className="mt-3 text-xs text-slate-500">
                            {currentUser?.roleName !== approval.stage
                              ? `Only the ${approval.stage} role can decide this stage.`
                              : 'The previous stage must be approved first.'}
                          </p>
                        )}
                      </div>

                      {actionable && (
                        <div className="w-full lg:max-w-sm">
                          <label
                            htmlFor={`remarks-${approval.approval_id}`}
                            className="mb-1.5 block text-xs font-semibold text-slate-600"
                          >
                            Remarks
                            {approval.stage === 'Admin' ? ' (optional)' : ''}
                          </label>

                          <textarea
                            id={`remarks-${approval.approval_id}`}
                            value={remarks[approval.approval_id] || ''}
                            onChange={(event) =>
                              setRemarks((previous) => ({
                                ...previous,
                                [approval.approval_id]: event.target.value,
                              }))
                            }
                            rows={2}
                            maxLength={2000}
                            placeholder="Add a note for this decision…"
                            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                          />

                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => void decide(approval, 'Approved')}
                              disabled={isBusy}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {isBusy ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              onClick={() => void decide(approval, 'Rejected')}
                              disabled={isBusy}
                              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

