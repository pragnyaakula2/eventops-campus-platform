-- =====================================================================
-- EventOps: College Event Operations and Resource Management System
-- File    : database/pgvector.sql   (Phase 3: Semantic Search & Vector Embeddings)
-- Target  : PostgreSQL 14+ with pgvector 0.5+
-- Run     : psql -d eventops -f database/pgvector.sql
-- =====================================================================

-- 1. Ensure the vector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Idempotently add the 384-dimensional embedding column to events
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'events'
          AND column_name = 'embedding'
    ) THEN
        ALTER TABLE events ADD COLUMN embedding vector(384);
        RAISE NOTICE 'Added column "embedding vector(384)" to table "events".';
    ELSE
        RAISE NOTICE 'Column "embedding" already exists on table "events".';
    END IF;
END $$;

-- 3. Create HNSW index for cosine distance similarity search
-- HNSW provides sub-millisecond query latency and high recall.
CREATE INDEX IF NOT EXISTS idx_events_embedding_hnsw
ON events USING hnsw (embedding vector_cosine_ops);

-- 4. Vector similarity match function
-- Returns events ranked by cosine similarity (1 - cosine distance)
DROP FUNCTION IF EXISTS match_events(vector(384), FLOAT, INT);

CREATE OR REPLACE FUNCTION match_events(
    query_embedding vector(384),
    match_threshold FLOAT DEFAULT 0.0,
    match_count     INT   DEFAULT 10
)
RETURNS TABLE (
    event_id        INT,
    title           VARCHAR(200),
    description     TEXT,
    category_name   VARCHAR(60),
    club_name       VARCHAR(100),
    start_time      TIMESTAMPTZ,
    end_time        TIMESTAMPTZ,
    status          event_status,
    similarity      FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.event_id,
        e.title,
        e.description,
        ec.category_name,
        c.club_name,
        e.start_time,
        e.end_time,
        e.status,
        ROUND((1.0 - (e.embedding <=> query_embedding))::numeric, 4)::FLOAT AS similarity
    FROM events e
    LEFT JOIN event_categories ec ON e.category_id = ec.category_id
    LEFT JOIN clubs c ON e.club_id = c.club_id
    WHERE e.embedding IS NOT NULL
      AND (1.0 - (e.embedding <=> query_embedding)) >= match_threshold
    ORDER BY e.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;
