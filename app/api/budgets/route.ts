import { connection } from 'next/server';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';


export async function GET(req: NextRequest) {
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status')?.trim();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(event_title ILIKE $${params.length}
          OR event_status::text ILIKE $${params.length})`
      );
    }

    if (status && status !== 'All') {
      params.push(status);
      conditions.push(`budget_status::text = $${params.length}`);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const budgetsResult = await query(
      `SELECT *
       FROM vw_budget_utilization
       ${where}
       ORDER BY event_id`,
      params
    );

    const expenseConditions: string[] = [];
    const expenseParams: unknown[] = [];

    if (search) {
      expenseParams.push(`%${search}%`);
      expenseConditions.push(
        `(e.title ILIKE $${expenseParams.length}
          OR ex.description ILIKE $${expenseParams.length})`
      );
    }

    if (status && status !== 'All') {
      expenseParams.push(status);
      expenseConditions.push(
        `b.status::text = $${expenseParams.length}`
      );
    }

    const expenseWhere = expenseConditions.length
      ? `WHERE ${expenseConditions.join(' AND ')}`
      : '';

    const expensesResult = await query(
      `SELECT
         ex.expense_id,
         ex.budget_id,
         ex.description,
         ex.amount,
         ex.expense_date,
         b.event_id,
         e.title AS event_title,
         b.status AS budget_status
       FROM expenses ex
       JOIN budgets b ON b.budget_id = ex.budget_id
       JOIN events e ON e.event_id = b.event_id
       ${expenseWhere}
       ORDER BY ex.expense_date DESC, ex.expense_id DESC`,
      expenseParams
    );

    const budgets = budgetsResult.rows;
    const expenses = expensesResult.rows;

    const summary = budgets.reduce(
      (acc, budget) => {
        acc.allocatedBudget += Number(budget.allocated_budget || 0);
        acc.totalExpenses += Number(budget.total_expenses || 0);
        acc.remainingBalance += Number(budget.remaining_balance || 0);
        acc.totalSponsorship += Number(budget.total_sponsorship || 0);
        acc.netCostToCollege += Number(budget.net_cost_to_college || 0);
        return acc;
      },
      {
        allocatedBudget: 0,
        totalExpenses: 0,
        remainingBalance: 0,
        totalSponsorship: 0,
        netCostToCollege: 0,
      }
    );

    return NextResponse.json({
      success: true,
      count: budgets.length,
      summary,
      budgets,
      expenses,
    });
  } catch (err: unknown) {
    console.error('Error fetching budgets:', err);

    const message =
      err instanceof Error ? err.message : 'Failed to fetch budgets';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}


