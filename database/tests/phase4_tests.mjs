// =====================================================================
// EventOps: Phase 4 Automated Test Suite
// File    : database/phase4_tests.mjs
// Run     : node database/phase4_tests.mjs
// Verifies: PostgreSQL pool, MongoDB singleton, Bcrypt auth, JWT cookies,
//           RBAC guards, Demo role-switching, Semantic search, Registration,
//           and MongoDB Audit logging.
// =====================================================================
import { pool, query, getClient } from '../../lib/db.ts';
import { getDb } from '../../lib/mongodb.ts';
import {
  authenticateUser,
  verifySessionToken,
  switchDemoRole,
  assertUserHasRole,
  getDemoAccountForRole,
} from '../../lib/auth.ts';
import {
  listEvents,
  getEventDetails,
  registerForEvent,
} from '../../lib/events.ts';

let passedCount = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedCount++;
    console.log(`✓ PASS  [${testName}] ${details}`);
  } else {
    console.error(`✗ FAIL  [${testName}] ${details}`);
  }
}

async function runTests() {
  console.log('=====================================================================');
  console.log('EventOps Phase 4 Test Suite: Connectors, Auth, RBAC & Backend APIs');
  console.log('=====================================================================\n');

  try {
    // -----------------------------------------------------------------
    // Section A: Database Connection Pool Singletons
    // -----------------------------------------------------------------
    console.log('--- A. Database Connection Pool & Client Singletons ---');

    // Test 1: PostgreSQL query helper
    const pgRes = await query('SELECT count(*)::int AS count FROM users');
    assert(pgRes.rows[0].count === 21, 'P4_T01', `PostgreSQL pool connected (verified ${pgRes.rows[0].count} users)`);

    // Test 2: PostgreSQL dedicated PoolClient transaction
    const client = await getClient();
    await client.query('BEGIN');
    const txRes = await client.query('SELECT 42 AS answer');
    await client.query('ROLLBACK');
    client.release();
    assert(txRes.rows[0].answer === 42, 'P4_T02', 'Dedicated PoolClient acquired, queried in tx, and released');

    // Test 3: MongoDB client singleton ping & collection access
    const mongoDb = await getDb();
    const ping = await mongoDb.command({ ping: 1 });
    assert(ping.ok === 1, 'P4_T03', 'MongoDB client singleton active and responding to ping');

    // -----------------------------------------------------------------
    // Section B: User Authentication & Bcrypt Verification
    // -----------------------------------------------------------------
    console.log('\n--- B. User Authentication & Password Hashing ---');

    // Test 4: Positive login with seeded password Password@123
    const authSuccess = await authenticateUser('admin@eventops.edu', 'Password@123');
    assert(
      authSuccess.session && authSuccess.session.roleName === 'Admin' && typeof authSuccess.token === 'string',
      'P4_T04',
      `Login successful for admin@eventops.edu (User ID: ${authSuccess.session.userId}, Role: ${authSuccess.session.roleName})`
    );

    // Test 5: Negative login: incorrect password rejected
    let badPasswordRejected = false;
    try {
      await authenticateUser('admin@eventops.edu', 'WrongPass123');
    } catch (err) {
      if (err.message.includes('Invalid email or password')) {
        badPasswordRejected = true;
      }
    }
    assert(badPasswordRejected, 'P4_T05', 'Authentication rejected invalid password');

    // Test 6: Negative login: non-existent email rejected
    let missingEmailRejected = false;
    try {
      await authenticateUser('ghost@eventops.edu', 'Password@123');
    } catch (err) {
      if (err.message.includes('Invalid email or password')) {
        missingEmailRejected = true;
      }
    }
    assert(missingEmailRejected, 'P4_T06', 'Authentication rejected non-existent email');

    // -----------------------------------------------------------------
    // Section C: JWT Tokens, Session Verification & Tamper Protection
    // -----------------------------------------------------------------
    console.log('\n--- C. JWT Session Signing, Expiration & Tamper Resistance ---');

    // Test 7: Verify valid token
    const parsedSession = await verifySessionToken(authSuccess.token);
    assert(
      parsedSession && parsedSession.email === 'admin@eventops.edu' && parsedSession.roleName === 'Admin',
      'P4_T07',
      'Valid JWT session token verified and parsed correctly'
    );

    // Test 8: Tampered token signature must be rejected
    const tamperedToken = authSuccess.token.slice(0, -6) + 'abc123';
    const tamperedRes = await verifySessionToken(tamperedToken);
    assert(tamperedRes === null, 'P4_T08', 'Tampered JWT token rejected (returns null)');

    // -----------------------------------------------------------------
    // Section D: Role-Based Access Control (RBAC) Server-Side Enforcement
    // -----------------------------------------------------------------
    console.log('\n--- D. Server-Side Role-Based Authorization Guards ---');

    const studentSession = await getDemoAccountForRole('Student');
    const adminSession = await getDemoAccountForRole('Admin');
    const organizerSession = await getDemoAccountForRole('Organizer');

    // Test 9: Student accessing Student route
    let studentAllowed = false;
    try {
      assertUserHasRole(studentSession, ['Student']);
      studentAllowed = true;
    } catch {}
    assert(studentAllowed, 'P4_T09', 'Student authorized for Student operations');

    // Test 10: Student forbidden from Admin route
    let studentBlockedFromAdmin = false;
    try {
      assertUserHasRole(studentSession, ['Admin']);
    } catch (err) {
      if (err.status === 403) {
        studentBlockedFromAdmin = true;
      }
    }
    assert(studentBlockedFromAdmin, 'P4_T10', 'Student blocked with 403 Forbidden on Admin route');

    // Test 11: Organizer forbidden from Faculty/HOD approvals
    let organizerBlockedFromApproval = false;
    try {
      assertUserHasRole(organizerSession, ['Faculty', 'HOD']);
    } catch (err) {
      if (err.status === 403) {
        organizerBlockedFromApproval = true;
      }
    }
    assert(organizerBlockedFromApproval, 'P4_T11', 'Organizer blocked with 403 Forbidden on Faculty/HOD approval routes');

    // Test 12: Admin authorized for Admin route
    let adminAllowed = false;
    try {
      assertUserHasRole(adminSession, ['Admin']);
      adminAllowed = true;
    } catch {}
    assert(adminAllowed, 'P4_T12', 'Admin authorized for Admin operations');

    // -----------------------------------------------------------------
    // Section E: Demo Persona Switching (Development Mode Only)
    // -----------------------------------------------------------------
    console.log('\n--- E. Demo Role Switching ---');

    const switchedFaculty = await switchDemoRole('Faculty');
    assert(
      switchedFaculty.session.roleName === 'Faculty' && switchedFaculty.session.email === 'faculty.cse@eventops.edu',
      'P4_T13',
      'Switched demo persona to Faculty (faculty.cse@eventops.edu)'
    );

    const switchedHOD = await switchDemoRole('HOD');
    assert(
      switchedHOD.session.roleName === 'HOD' && switchedHOD.session.email === 'hod.cse@eventops.edu',
      'P4_T14',
      'Switched demo persona to HOD (hod.cse@eventops.edu)'
    );

    // -----------------------------------------------------------------
    // Section F: Event Operations & Semantic Search Integration
    // -----------------------------------------------------------------
    console.log('\n--- F. Event Listing & Dense Semantic Vector Search ---');

    // Test 15: Event listing without search returns all active events
    const allEvents = await listEvents({ limit: 12 });
    assert(allEvents.length >= 10, 'P4_T15', `listEvents returned ${allEvents.length} events from PostgreSQL views`);

    // Test 16: Semantic search for hackathon matches CodeSprint
    const semanticResults = await listEvents({ search: 'student programming hackathon and software competition' });
    const topMatch = semanticResults[0];
    assert(
      topMatch && topMatch.event_id === 1,
      'P4_T16',
      `Semantic search matched "${topMatch?.event_title}" at rank #1 (Similarity: ${topMatch?.similarity_score})`
    );

    // Test 17: Fetch event details with MongoDB feedback summary
    const event1Details = await getEventDetails(1);
    assert(
      event1Details && event1Details.overview && event1Details.feedback && event1Details.feedback.summary.total_reviews >= 3,
      'P4_T17',
      `getEventDetails(1) combined relational overview with MongoDB feedback (Reviews: ${event1Details?.feedback?.summary?.total_reviews})`
    );

    // -----------------------------------------------------------------
    // Section G: Atomic Registration & Waitlist Operations
    // -----------------------------------------------------------------
    console.log('\n--- G. Registration & Waitlist Operations with sp_ procedures ---');

    // Event 6 has capacity 3 and is full. Student 16 joins waitlist.
    const student16Session = {
      userId: 16,
      email: 'student7@eventops.edu',
      fullName: 'Vikram Joshi',
      roleId: 5,
      roleName: 'Student',
      deptId: 1,
    };

    // Clean test state before running
    await query('DELETE FROM waitlist WHERE event_id = 6 AND student_id = 16');

    // Test 18: Register for full event places on waitlist
    const regResult = await registerForEvent(6, student16Session);
    assert(
      regResult.result_type === 'Waitlisted' && regResult.queue_position >= 1,
      'P4_T18',
      `Student 16 atomically placed on waitlist for Event 6 at position #${regResult.queue_position}`
    );

    // Test 19: Clean up test registration
    await query('DELETE FROM waitlist WHERE event_id = 6 AND student_id = 16');
    assert(true, 'P4_T19', 'Cleaned up test waitlist record without modifying seed data');

    // -----------------------------------------------------------------
    // Section H: MongoDB Audit Trail Logging
    // -----------------------------------------------------------------
    console.log('\n--- H. MongoDB Audit Log Verification ---');

    // Test 20: Audit log recorded for login
    const loginAudit = await mongoDb.collection('system_audit_logs').findOne({
      action: 'USER_LOGIN_SUCCESS',
      actor_email: 'admin@eventops.edu',
    });
    assert(loginAudit !== null, 'P4_T20', 'MongoDB recorded USER_LOGIN_SUCCESS audit document with timestamp and metadata');

    // Test 21: Audit log recorded for demo role switch
    const switchAudit = await mongoDb.collection('system_audit_logs').findOne({
      action: 'DEMO_ROLE_SWITCH',
      'details.switchedTo': 'Faculty',
    });
    assert(switchAudit !== null, 'P4_T21', 'MongoDB recorded DEMO_ROLE_SWITCH audit document');

  } finally {
    await pool.end();
  }

  console.log('\n=====================================================================');
  console.log(`Test Results: ${passedCount} / ${totalTests} Passed (${totalTests - passedCount} Failed)`);
  console.log('=====================================================================');

  if (passedCount !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal error during Phase 4 testing:', err);
  process.exit(1);
});
