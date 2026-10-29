
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query(`
      SELECT
        ex.expense_id,
        ex.budget_id,
        b.event_id,
        e.title AS event_title,
        b.status AS budget_status,
        ex.description,
        ex.amount,
        ex.expense_date
      FROM expenses ex
      JOIN budgets b ON b.budget_id = ex.budget_id
      JOIN events e ON e.event_id = b.event_id
      ORDER BY ex.expense_date DESC, ex.expense_id DESC
    `);

    const totalExpenses = result.rows.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      totalExpenses,
      expenses: result.rows,
    });
  } catch (err: unknown) {
    console.error('Error fetching expenses:', err);

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error
          ? err.message
          : 'Failed to fetch expenses',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { budget_id, description, amount, expense_date } = body;

    if (
      !Number.isSafeInteger(Number(budget_id)) ||
      Number(budget_id) <= 0 ||
      typeof description !== 'string' ||
      !description.trim() ||
      description.trim().length > 200 ||
      amount === undefined ||
      amount === null ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) < 0
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid expense details' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO expenses
         (budget_id, description, amount, expense_date)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE))
       RETURNING expense_id, budget_id, description, amount, expense_date`,
      [
        Number(budget_id),
        description.trim(),
        Number(amount),
        expense_date || null,
      ]
    );

    return NextResponse.json(
      { success: true, expense: result.rows[0] },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('Error creating expense:', err);

    const message = err instanceof Error ? err.message : '';

    if (message.includes('budget') || message.includes('Budget')) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: message || 'Failed to create expense',
      },
      { status: 500 }
    );
  }
}

