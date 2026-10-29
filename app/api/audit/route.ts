import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, assertUserHasRole, COOKIE_NAME } from '@/lib/auth.ts';
import { getDb } from '@/lib/mongodb.ts';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = await verifySessionToken(token || '');
    assertUserHasRole(session, ['Admin', 'Faculty', 'HOD']);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));
    const action = searchParams.get('action') || undefined;

    const db = await getDb();
    const filter = action ? { action } : {};

    const logs = await db
      .collection('system_audit_logs')
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({ success: true, count: logs.length, logs });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch audit logs' },
      { status }
    );
  }
}
