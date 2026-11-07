// =====================================================================
// EventOps: MongoDB Collections, Validation, Indexes & Seed
// File    : app/database/mongo/setup.mjs
// Run     : node database/mongo/setup.mjs [--seed]
// =====================================================================
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventops';
const DB_NAME = process.env.MONGODB_DB_NAME || 'eventops';

export async function setupMongo(options = { seed: false }) {
  const uri = options.uri || MONGODB_URI;
  const dbName = options.dbName || DB_NAME;

  console.log(`Connecting to MongoDB at: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`✓ Connected to MongoDB database: "${dbName}"`);

  // -------------------------------------------------------------------
  // 1. Setup collection: event_feedback with JSON Schema validation
  // -------------------------------------------------------------------
  const feedbackSchema = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['event_id', 'student_id', 'rating', 'would_recommend', 'created_at'],
      properties: {
        event_id: {
          bsonType: 'int',
          description: 'References PostgreSQL events(event_id) - required integer',
        },
        student_id: {
          bsonType: 'int',
          description: 'References PostgreSQL users(user_id) - required integer',
        },
        rating: {
          bsonType: 'int',
          minimum: 1,
          maximum: 5,
          description: 'Overall event rating from 1 to 5',
        },
        content_quality: {
          bsonType: 'int',
          minimum: 1,
          maximum: 5,
          description: 'Rating for content quality',
        },
        organization_rating: {
          bsonType: 'int',
          minimum: 1,
          maximum: 5,
          description: 'Rating for event logistics/organization',
        },
        venue_rating: {
          bsonType: 'int',
          minimum: 1,
          maximum: 5,
          description: 'Rating for venue comfort and facilities',
        },
        comments: {
          bsonType: ['string', 'null'],
          maxLength: 1000,
          description: 'Optional textual review feedback',
        },
        tags: {
          bsonType: 'array',
          items: { bsonType: 'string' },
          description: 'Tags highlighting event strengths',
        },
        would_recommend: {
          bsonType: 'bool',
          description: 'Whether student would recommend this event',
        },
        created_at: {
          bsonType: 'date',
          description: 'Submission timestamp',
        },
      },
    },
  };

  const existingCollections = await db.listCollections().toArray();
  const colNames = existingCollections.map((c) => c.name);

  if (!colNames.includes('event_feedback')) {
    await db.createCollection('event_feedback', { validator: feedbackSchema });
    console.log('✓ Created collection "event_feedback" with schema validator');
  } else {
    await db.command({
      collMod: 'event_feedback',
      validator: feedbackSchema,
    });
    console.log('✓ Updated schema validator for "event_feedback"');
  }

  // Feedback Indexes (createIndex is idempotent)
  const feedbackCol = db.collection('event_feedback');
  await feedbackCol.createIndex({ event_id: 1, student_id: 1 }, { unique: true, name: 'uq_event_student_feedback' });
  await feedbackCol.createIndex({ event_id: 1, rating: -1 }, { name: 'idx_event_rating' });
  await feedbackCol.createIndex({ created_at: -1 }, { name: 'idx_feedback_created_at' });
  console.log('✓ Created indexes on "event_feedback"');

  // -------------------------------------------------------------------
  // 2. Setup collection: system_audit_logs with JSON Schema validation
  // -------------------------------------------------------------------
  const auditSchema = {
    $jsonSchema: {
      bsonType: 'object',
      required: ['action', 'entity_type', 'actor_id', 'actor_email', 'actor_role', 'timestamp'],
      properties: {
        action: {
          bsonType: 'string',
          description: 'Audit action code, e.g., REGISTRATION_CREATED, APPROVAL_DECIDED',
        },
        entity_type: {
          bsonType: 'string',
          description: 'Domain entity, e.g., EVENT, REGISTRATION, BUDGET, VENUE, ATTENDANCE',
        },
        entity_id: {
          bsonType: ['int', 'string', 'null'],
          description: 'Identifier of the affected entity',
        },
        actor_id: {
          bsonType: 'int',
          description: 'User ID of the initiator (0 for system)',
        },
        actor_email: {
          bsonType: 'string',
          description: 'Email of the actor',
        },
        actor_role: {
          bsonType: 'string',
          description: 'Role at time of action',
        },
        details: {
          bsonType: 'object',
          description: 'Structured metadata capturing state changes or context',
        },
        timestamp: {
          bsonType: 'date',
          description: 'Action timestamp',
        },
      },
    },
  };

  if (!colNames.includes('system_audit_logs')) {
    await db.createCollection('system_audit_logs', { validator: auditSchema });
    console.log('✓ Created collection "system_audit_logs" with schema validator');
  } else {
    await db.command({
      collMod: 'system_audit_logs',
      validator: auditSchema,
    });
    console.log('✓ Updated schema validator for "system_audit_logs"');
  }

  // Audit Logs Indexes
  const auditCol = db.collection('system_audit_logs');
  await auditCol.createIndex({ action: 1, timestamp: -1 }, { name: 'idx_audit_action_time' });
  await auditCol.createIndex({ entity_type: 1, entity_id: 1, timestamp: -1 }, { name: 'idx_audit_entity_time' });
  await auditCol.createIndex({ actor_id: 1, timestamp: -1 }, { name: 'idx_audit_actor_time' });
  await auditCol.createIndex({ timestamp: -1 }, { name: 'idx_audit_time' });
  console.log('✓ Created indexes on "system_audit_logs"');

  // -------------------------------------------------------------------
  // 3. Optional Development Seed Data (explicit opt-in via options.seed)
  // -------------------------------------------------------------------
  if (options.seed) {
    const feedbackCount = await feedbackCol.countDocuments();
    if (feedbackCount === 0) {
      console.log('Seeding initial event feedback documents (dev mode)...');
      const sampleFeedbacks = [
        {
          event_id: 1,
          student_id: 10,
          rating: 5,
          content_quality: 5,
          organization_rating: 4,
          venue_rating: 4,
          comments: 'Incredible hackathon! The problem statements were challenging and mentorship was great.',
          tags: ['Challenging', 'Great Mentors', 'Well Organized'],
          would_recommend: true,
          created_at: new Date(Date.now() - 38 * 24 * 3600 * 1000),
        },
        {
          event_id: 1,
          student_id: 11,
          rating: 4,
          content_quality: 5,
          organization_rating: 4,
          venue_rating: 4,
          comments: 'Great atmosphere, WiFi in the lab was fast throughout the 24 hours.',
          tags: ['Fast WiFi', 'Good Food'],
          would_recommend: true,
          created_at: new Date(Date.now() - 38 * 24 * 3600 * 1000),
        },
        {
          event_id: 1,
          student_id: 12,
          rating: 5,
          content_quality: 5,
          organization_rating: 5,
          venue_rating: 5,
          comments: 'Loved the hardware prototyping track and sponsor prizes.',
          tags: ['Great Prizes', 'Inspiring'],
          would_recommend: true,
          created_at: new Date(Date.now() - 38 * 24 * 3600 * 1000),
        },
        {
          event_id: 3,
          student_id: 10,
          rating: 5,
          content_quality: 5,
          organization_rating: 5,
          venue_rating: 5,
          comments: 'The stage lighting and sound setup in the auditorium was world class!',
          tags: ['Energetic', 'Superb Audio', 'Memorable'],
          would_recommend: true,
          created_at: new Date(Date.now() - 14 * 24 * 3600 * 1000),
        },
        {
          event_id: 3,
          student_id: 14,
          rating: 5,
          content_quality: 5,
          organization_rating: 4,
          venue_rating: 5,
          comments: 'Unforgettable night, music performances by the band were breathtaking.',
          tags: ['Great Crowd', 'Talented Acts'],
          would_recommend: true,
          created_at: new Date(Date.now() - 14 * 24 * 3600 * 1000),
        },
        {
          event_id: 3,
          student_id: 15,
          rating: 4,
          content_quality: 4,
          organization_rating: 4,
          venue_rating: 4,
          comments: 'Crowd was huge! Entry queue was a bit slow but the performances made up for it.',
          tags: ['Huge Attendance', 'Fun'],
          would_recommend: true,
          created_at: new Date(Date.now() - 14 * 24 * 3600 * 1000),
        },
        {
          event_id: 4,
          student_id: 11,
          rating: 5,
          content_quality: 5,
          organization_rating: 5,
          venue_rating: 4,
          comments: 'Super helpful feedback from angel alumni investors.',
          tags: ['Insightful', 'Networking'],
          would_recommend: true,
          created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        },
        {
          event_id: 4,
          student_id: 16,
          rating: 4,
          content_quality: 4,
          organization_rating: 4,
          venue_rating: 4,
          comments: 'Very well paced pitches and insightful Q&A.',
          tags: ['Networking', 'Inspiring'],
          would_recommend: true,
          created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        },
      ];

      await feedbackCol.insertMany(sampleFeedbacks);
      console.log(`✓ Seeded ${sampleFeedbacks.length} feedback documents`);
    }

    const auditCount = await auditCol.countDocuments();
    if (auditCount === 0) {
      console.log('Seeding initial system audit logs (dev mode)...');
      const sampleAuditLogs = [
        {
          action: 'EVENT_CREATED',
          entity_type: 'EVENT',
          entity_id: 5,
          actor_id: 6,
          actor_email: 'organizer1@eventops.edu',
          actor_role: 'Organizer',
          details: { title: 'AI for Beginners Seminar', venue_id: 2, capacity: 120 },
          timestamp: new Date(Date.now() - 20 * 24 * 3600 * 1000),
        },
        {
          action: 'APPROVAL_DECIDED',
          entity_type: 'APPROVAL',
          entity_id: 5,
          actor_id: 2,
          actor_email: 'faculty.cse@eventops.edu',
          actor_role: 'Faculty',
          details: { stage: 'Faculty', decision: 'Approved', comments: 'Approved for CSE students.' },
          timestamp: new Date(Date.now() - 19 * 24 * 3600 * 1000),
        },
        {
          action: 'APPROVAL_DECIDED',
          entity_type: 'APPROVAL',
          entity_id: 5,
          actor_id: 4,
          actor_email: 'hod.cse@eventops.edu',
          actor_role: 'HOD',
          details: { stage: 'HOD', decision: 'Approved', comments: 'HOD clearance granted.' },
          timestamp: new Date(Date.now() - 18 * 24 * 3600 * 1000),
        },
        {
          action: 'APPROVAL_DECIDED',
          entity_type: 'APPROVAL',
          entity_id: 5,
          actor_id: 1,
          actor_email: 'admin@eventops.edu',
          actor_role: 'Admin',
          details: { stage: 'Admin', decision: 'Approved', comments: 'Final admin signoff.' },
          timestamp: new Date(Date.now() - 17 * 24 * 3600 * 1000),
        },
        {
          action: 'REGISTRATION_OVERFLOW_WAITLIST',
          entity_type: 'REGISTRATION',
          entity_id: 6,
          actor_id: 14,
          actor_email: 'student5@eventops.edu',
          actor_role: 'Student',
          details: { event_title: 'IoT Lab Mini Workshop', queue_position: 1 },
          timestamp: new Date(Date.now() - 24 * 3600 * 1000),
        },
      ];

      await auditCol.insertMany(sampleAuditLogs);
      console.log(`✓ Seeded ${sampleAuditLogs.length} audit log documents`);
    }
  }

  await client.close();
  console.log('✓ MongoDB setup completed successfully.');
}

// CLI invocation support
if (process.argv[1]?.endsWith('setup.mjs')) {
  const shouldSeed = process.argv.includes('--seed');
  setupMongo({ seed: shouldSeed }).catch((err) => {
    console.error('MongoDB setup error:', err);
    process.exit(1);
  });
}
