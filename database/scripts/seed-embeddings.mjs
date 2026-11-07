// =====================================================================
// EventOps: Seed Real 384-Dimensional Embeddings into PostgreSQL
// File    : database/seed_embeddings.mjs
// Run     : node database/seed_embeddings.mjs
// =====================================================================
import pg from 'pg';
import { pipeline } from '@xenova/transformers';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/eventops',
});

async function main() {
  console.log('--- Initializing Local 384-d Embedding Generator ---');
  console.log('Model: Xenova/all-MiniLM-L6-v2 (offline local weights)');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });

  const client = await pool.connect();
  try {
    const { rows: events } = await client.query(
      'SELECT event_id, title, description FROM events ORDER BY event_id'
    );

    console.log(`Found ${events.length} events in database. Generating embeddings...`);

    for (const ev of events) {
      const textToEmbed = `${ev.title}. ${ev.description || ''}`.trim();
      const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data);

      // Strict validation
      if (vector.length !== 384) {
        throw new Error(`Event ${ev.event_id}: Expected 384 dimensions, got ${vector.length}`);
      }
      const allFinite = vector.every(v => typeof v === 'number' && Number.isFinite(v));
      if (!allFinite) {
        throw new Error(`Event ${ev.event_id}: Found non-finite value in vector`);
      }

      const vectorLiteral = `[${vector.join(',')}]`;
      await client.query(
        'UPDATE events SET embedding = $1 WHERE event_id = $2',
        [vectorLiteral, ev.event_id]
      );

      console.log(`  ✓ Event ${ev.event_id}: "${ev.title}" (384-d embedding stored)`);
    }

    console.log('\n--- Testing Semantic Search via PostgreSQL match_events() ---');

    const testQueries = [
      'machine learning and neural networks workshop',
      'music performance, dance and drama concert',
      '24 hour student software programming competition',
      'startup founders and pitch to venture investors',
    ];

    for (const query of testQueries) {
      console.log(`\nQuery: "${query}"`);
      const qOutput = await extractor(query, { pooling: 'mean', normalize: true });
      const qVector = `[${Array.from(qOutput.data).join(',')}]`;

      const { rows: matches } = await client.query(
        'SELECT event_id, title, category_name, similarity FROM match_events($1, 0.2, 3)',
        [qVector]
      );

      if (matches.length === 0) {
        console.log('  No matches found.');
      } else {
        matches.forEach((m, idx) => {
          console.log(`  #${idx + 1} [Score: ${m.similarity}] (ID: ${m.event_id}) "${m.title}" (${m.category_name || 'No Category'})`);
        });
      }
    }

    console.log('\nAll 12 event embeddings generated and verified successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error during embedding generation:', err);
  process.exit(1);
});
