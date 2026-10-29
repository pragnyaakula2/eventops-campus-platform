/**
 * EventOps Authentication & Authorization Service
 * Implements JWT session tokens, bcrypt hash verification, and server-side RBAC guards.
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { query } from './db.ts';
import { logSystemAudit } from './mongodb.ts';

export type RoleName = 'Admin' | 'Faculty' | 'HOD' | 'Organizer' | 'Student';

export interface UserSession {
  userId: number;
  email: string;
  fullName: string;
  roleId: number;
  roleName: RoleName;
  deptId: number | null;
  deptName?: string;
  isDemoSwitched?: boolean;
}

const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-insecure-secret-key-change-me-in-production-min-32-chars';
const secretKey = new TextEncoder().encode(AUTH_SECRET);
export const COOKIE_NAME = 'eventops_session';

/**
 * Signs a JWT session token with 7-day expiration.
 */
export async function createSessionToken(session: UserSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

/**
 * Verifies a JWT session token and returns the parsed session.
 */
export async function verifySessionToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      fullName: payload.fullName as string,
      roleId: payload.roleId as number,
      roleName: payload.roleName as RoleName,
      deptId: (payload.deptId as number) || null,
      deptName: (payload.deptName as string) || undefined,
      isDemoSwitched: Boolean(payload.isDemoSwitched),
    };
  } catch {
    return null;
  }
}

/**
 * Authenticates a user against PostgreSQL bcrypt password hashes.
 */
export async function authenticateUser(email: string, password: string): Promise<{
  session: UserSession;
  token: string;
}> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Email and password are required.');
  }

  const res = await query(
    `SELECT u.user_id, u.role_id, r.role_name, u.dept_id, d.dept_name,
            u.full_name, u.email, u.password_hash, u.is_active
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     LEFT JOIN departments d ON u.dept_id = d.dept_id
     WHERE LOWER(u.email) = $1`,
    [cleanEmail]
  );

  const user = res.rows[0];
  if (!user) {
    throw new Error('Invalid email or password.');
  }

  if (!user.is_active) {
    throw new Error('Account is deactivated. Please contact campus admin.');
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw new Error('Invalid email or password.');
  }

  const session: UserSession = {
    userId: user.user_id,
    email: user.email,
    fullName: user.full_name,
    roleId: user.role_id,
    roleName: user.role_name as RoleName,
    deptId: user.dept_id,
    deptName: user.dept_name,
  };

  const token = await createSessionToken(session);

  // Record audit log in MongoDB
  try {
    await logSystemAudit({
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.user_id,
      actorId: user.user_id,
      actorEmail: user.email,
      actorRole: user.role_name,
      details: { clientTime: new Date().toISOString() },
    });
  } catch (auditErr) {
    console.error('Audit logging non-fatal error:', auditErr);
  }

  return { session, token };
}

/**
 * Helper to get the canonical demo test account for each role.
 */
export async function getDemoAccountForRole(roleName: RoleName): Promise<UserSession> {
  const roleEmailMap: Record<RoleName, string> = {
    Admin: 'admin@eventops.edu',
    Faculty: 'faculty.cse@eventops.edu',
    HOD: 'hod.cse@eventops.edu',
    Organizer: 'organizer1@eventops.edu',
    Student: 'student1@eventops.edu',
  };

  const targetEmail = roleEmailMap[roleName];
  if (!targetEmail) {
    throw new Error(`Unsupported demo role: ${roleName}`);
  }

  const res = await query(
    `SELECT u.user_id, u.role_id, r.role_name, u.dept_id, d.dept_name,
            u.full_name, u.email
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     LEFT JOIN departments d ON u.dept_id = d.dept_id
     WHERE u.email = $1`,
    [targetEmail]
  );

  const user = res.rows[0];
  if (!user) {
    throw new Error(`Demo account for ${roleName} (${targetEmail}) not found.`);
  }

  return {
    userId: user.user_id,
    email: user.email,
    fullName: user.full_name,
    roleId: user.role_id,
    roleName: user.role_name as RoleName,
    deptId: user.dept_id,
    deptName: user.dept_name,
    isDemoSwitched: true,
  };
}

/**
 * Switches demo persona (only permitted in non-production environments).
 */
export async function switchDemoRole(targetRole: RoleName): Promise<{
  session: UserSession;
  token: string;
}> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Role switcher is disabled in production mode.');
  }

  const session = await getDemoAccountForRole(targetRole);
  const token = await createSessionToken(session);

  try {
    await logSystemAudit({
      action: 'DEMO_ROLE_SWITCH',
      entityType: 'USER',
      entityId: session.userId,
      actorId: session.userId,
      actorEmail: session.email,
      actorRole: session.roleName,
      details: { switchedTo: targetRole },
    });
  } catch (auditErr) {
    console.error('Audit logging non-fatal error:', auditErr);
  }

  return { session, token };
}

/**
 * Server-side RBAC guard. Throws Error if user is unauthorized or forbidden.
 */
export function assertUserHasRole(
  session: UserSession | null,
  allowedRoles: RoleName[]
): UserSession {
  if (!session) {
    const error = new Error('Authentication required.');
    (error as any).status = 401;
    throw error;
  }

  if (!allowedRoles.includes(session.roleName)) {
    const error = new Error(
      `Access denied: requires one of [${allowedRoles.join(', ')}], user has role "${session.roleName}".`
    );
    (error as any).status = 403;
    throw error;
  }

  return session;
}
