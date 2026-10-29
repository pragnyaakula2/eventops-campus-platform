/**
 * Local Semantic Search & Dense Vector Embedding Service
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions, cosine-normalized)
 * Runs 100% locally and offline without external API keys or network latency.
 */

type EmbeddingExtractor = (
  text: string,
  options: { pooling: string; normalize: boolean }
) => Promise<{ data: Float32Array | number[] }>;

// Cache pipeline promise as a singleton to avoid re-loading weights
let pipelinePromise: Promise<EmbeddingExtractor> | null = null;

async function getExtractor() {
  if (!pipelinePromise) {
    // Dynamic import to support both ESM Next.js and Node runtime
    const { pipeline } = await import('@xenova/transformers');
    pipelinePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    }) as unknown as Promise<EmbeddingExtractor>;
  }
  return pipelinePromise;
}

/**
 * Validates that an embedding is strictly 384 finite numbers.
 */
export function validateVector(vector: number[]): boolean {
  if (!Array.isArray(vector) || vector.length !== 384) {
    return false;
  }
  return vector.every((val) => typeof val === 'number' && Number.isFinite(val));
}

/**
 * Formats a number array into PostgreSQL vector syntax: '[0.0123,-0.0456,...]'
 */
export function formatVectorForPg(vector: number[]): string {
  if (!validateVector(vector)) {
    throw new Error(`Invalid vector: expected 384 finite numbers, got ${vector?.length || 0}`);
  }
  return `[${vector.join(',')}]`;
}

/**
 * Generates a 384-dimensional cosine-normalized dense embedding for a given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    throw new Error('Cannot generate embedding for empty text.');
  }

  const extractor = await getExtractor();
  const output = await extractor(cleanText, {
    pooling: 'mean',
    normalize: true,
  });

  const vector = Array.from(output.data as Float32Array) as number[];

  if (!validateVector(vector)) {
    throw new Error(`Embedding generation produced invalid vector: length=${vector.length}`);
  }

  return vector;
}
