// =====================================================================
// EventOps: Phase 3 Automated Test Suite
// File    : database/phase3_tests.mjs
// Run     : node database/phase3_tests.mjs
// Verifies: pgvector, 384-d local embeddings, cosine search,
//           MongoDB schema validation, indexes, and aggregation pipelines.
// =====================================================================
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { pipeline } from '@xenova/transformers';

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/eventops',
});
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventops';

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
  console.log('EventOps Phase 3 Test Suite: pgvector, Local Embeddings & MongoDB');
  console.log('=====================================================================\n');

  const pgClient = await pgPool.connect();
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const db = mongoClient.db('eventops');

  try {
    // -----------------------------------------------------------------
    // Section A: pgvector Schema & Index Verification
    // -----------------------------------------------------------------
    console.log('--- A. PostgreSQL pgvector & Embedding Column Tests ---');

    // Test 1: Extension exists
    const extRes = await pgClient.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    assert(extRes.rows.length > 0, 'P3_T01', `pgvector extension installed (version: ${extRes.rows[0]?.extversion})`);

    // Test 2: events.embedding column exists with vector(384)
    const colRes = await pgClient.query(`
      SELECT udt_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'embedding'
    `);
    assert(colRes.rows.length > 0 && colRes.rows[0].udt_name === 'vector', 'P3_T02', 'events.embedding vector column exists');

    // Test 3: HNSW cosine index exists on events
    const idxRes = await pgClient.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'events' AND indexname = 'idx_events_embedding_hnsw'
    `);
    assert(idxRes.rows.length > 0 && idxRes.rows[0].indexdef.includes('hnsw'), 'P3_T03', 'HNSW cosine index on embedding exists');

    // -----------------------------------------------------------------
    // Section B: Local Embedding Generation & Mathematical Correctness
    // -----------------------------------------------------------------
    console.log('\n--- B. Local 384-Dimensional Embedding Model Verification ---');
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

    const sampleText = 'Interactive Robotics and Autonomous Systems Workshop';
    const out = await extractor(sampleText, { pooling: 'mean', normalize: true });
    const vector = Array.from(out.data);

    // Test 4: Exactly 384 dimensions
    assert(vector.length === 384, 'P3_T04', `Vector dimension is exactly 384 (got: ${vector.length})`);

    // Test 5: All values are finite numeric floats
    const allFinite = vector.every(v => typeof v === 'number' && Number.isFinite(v));
    assert(allFinite, 'P3_T05', 'All 384 embedding values are valid finite numbers');

    // Test 6: Vector is unit normalized (L2 norm ≈ 1.0 for cosine similarity)
    const norm = Math.sqrt(vector.reduce((acc, val) => acc + val * val, 0));
    const isNormalized = Math.abs(norm - 1.0) < 0.01;
    assert(isNormalized, 'P3_T06', `Vector is cosine-normalized (L2 norm = ${norm.toFixed(4)})`);

    // -----------------------------------------------------------------
    // Section C: PostgreSQL match_events() Semantic Search Tests
    // -----------------------------------------------------------------
    console.log('\n--- C. Semantic Search Retrieval Accuracy Tests ---');

    // Test 7: Query for AI seminar matches event 5 as top result
    const aiQuery = 'introductory seminar on machine learning and artificial intelligence';
    const aiOut = await extractor(aiQuery, { pooling: 'mean', normalize: true });
    const aiVector = `[${Array.from(aiOut.data).join(',')}]`;

    const aiMatches = await pgClient.query('SELECT event_id, title, similarity FROM match_events($1, 0.2, 3)', [aiVector]);
    const topAiEvent = aiMatches.rows[0];
    assert(topAiEvent && topAiEvent.event_id === 5, 'P3_T07',
      `Query for AI matched "${topAiEvent?.title}" at rank #1 (Score: ${topAiEvent?.similarity})`
    );

    // Test 8: Query for Cultural Concert matches event 3 as top result
    const musicQuery = 'classical music dance performances and live drama festival';
    const musicOut = await extractor(musicQuery, { pooling: 'mean', normalize: true });
    const musicVector = `[${Array.from(musicOut.data).join(',')}]`;

    const musicMatches = await pgClient.query('SELECT event_id, title, similarity FROM match_events($1, 0.2, 3)', [musicVector]);
    const topMusicEvent = musicMatches.rows[0];
    assert(topMusicEvent && topMusicEvent.event_id === 3, 'P3_T08',
      `Query for Music matched "${topMusicEvent?.title}" at rank #1 (Score: ${topMusicEvent?.similarity})`
    );

    // -----------------------------------------------------------------
    // Section D: MongoDB Collections, Validation & Indexes
    // -----------------------------------------------------------------
    console.log('\n--- D. MongoDB Schema Validation & Index Tests ---');
    const feedbackCol = db.collection('event_feedback');
    const auditCol = db.collection('system_audit_logs');

    // Test 9: Valid feedback insertion and unique constraint
    const testStudentId = 9999;
    const testFeedbackDoc = {
      event_id: 2,
      student_id: testStudentId,
      rating: 5,
      content_quality: 5,
      organization_rating: 4,
      venue_rating: 4,
      comments: 'Temporary test review for verification',
      tags: ['Hands-on', 'Hardware'],
      would_recommend: true,
      created_at: new Date()
    };

    // Clean any previous test run document
    await feedbackCol.deleteOne({ event_id: 2, student_id: testStudentId });

    const insertRes = await feedbackCol.insertOne(testFeedbackDoc);
    assert(insertRes.acknowledged, 'P3_T09', 'Valid feedback document successfully inserted into MongoDB');

    // Test 10: Duplicate feedback for same event & student rejected by unique index
    let duplicateRejected = false;
    try {
      await feedbackCol.insertOne(testFeedbackDoc);
    } catch (err) {
      if (err.code === 11000) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, 'P3_T10', 'Duplicate feedback rejected by unique compound index (event_id + student_id)');

    // Test 11: Invalid feedback rejected by MongoDB $jsonSchema validator (rating = 6 exceeds maximum 5)
    let schemaRejected = false;
    try {
      await feedbackCol.insertOne({
        event_id: 2,
        student_id: 8888,
        rating: 6, // invalid: max 5
        would_recommend: true,
        created_at: new Date()
      });
    } catch (err) {
      if (err.message && err.message.includes('Document failed validation')) {
        schemaRejected = true;
      }
    }
    assert(schemaRejected, 'P3_T11', 'MongoDB $jsonSchema validator rejected out-of-range rating (rating: 6)');

    // Test 12: Audit log insertion and indexing
    const auditRes = await auditCol.insertOne({
      action: 'TEST_PHASE3_VERIFICATION',
      entity_type: 'SYSTEM',
      entity_id: 1,
      actor_id: 1,
      actor_email: 'admin@eventops.edu',
      actor_role: 'Admin',
      details: { test: true, timestamp: new Date().toISOString() },
      timestamp: new Date()
    });
    assert(auditRes.acknowledged, 'P3_T12', 'System audit log document successfully inserted');

    // Clean up temporary test documents
    await feedbackCol.deleteOne({ event_id: 2, student_id: testStudentId });
    await auditCol.deleteOne({ _id: auditRes.insertedId });

    // -----------------------------------------------------------------
    // Section E: MongoDB Aggregation Pipeline Verification
    // -----------------------------------------------------------------
    console.log('\n--- E. MongoDB Aggregation Pipeline Tests ---');

    // Test 13: Event 1 feedback aggregation (CodeSprint Hackathon)
    const pipelineEvent1 = [
      { $match: { event_id: 1 } },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total_reviews: { $sum: 1 },
                avg_rating: { $avg: '$rating' },
                recommend_count: { $sum: { $cond: ['$would_recommend', 1, 0] } }
              }
            }
          ],
          top_tags: [
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 }
          ]
        }
      }
    ];

    const [aggResult] = await feedbackCol.aggregate(pipelineEvent1).toArray();
    const summary = aggResult.summary[0];
    const topTags = aggResult.top_tags;

    assert(summary && summary.total_reviews >= 3, 'P3_T13',
      `Aggregation calculated summary for Event 1: total_reviews=${summary?.total_reviews}, avg_rating=${summary?.avg_rating?.toFixed(2)}`
    );

    assert(topTags && topTags.length > 0, 'P3_T14',
      `Aggregation computed top tags: ${topTags.map(t => `${t._id}(${t.count})`).join(', ')}`
    );

    // Test 14: Campus-wide summary pipeline
    const campusPipeline = [
      {
        $group: {
          _id: '$event_id',
          review_count: { $sum: 1 },
          avg_rating: { $avg: '$rating' }
        }
      },
      { $sort: { avg_rating: -1 } }
    ];
    const campusStats = await feedbackCol.aggregate(campusPipeline).toArray();
    assert(campusStats.length >= 3, 'P3_T15',
      `Campus-wide aggregation returned ratings for ${campusStats.length} events`
    );

  } finally {
    pgClient.release();
    await pgPool.end();
    await mongoClient.close();
  }

  console.log('\n=====================================================================');
  console.log(`Test Results: ${passedCount} / ${totalTests} Passed (${totalTests - passedCount} Failed)`);
  console.log('=====================================================================');

  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during Phase 3 testing:', err);
  process.exit(1);
});
