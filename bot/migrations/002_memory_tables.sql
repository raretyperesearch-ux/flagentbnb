-- =====================================================
-- FLAGENT MEMORY TABLES
-- Run against Supabase project: seartddspffufwiqzwvh
-- Tables: agent_memory, agent_relationships
-- These may already exist — this is idempotent
-- =====================================================

-- agent_memory: stores all flagent's memories across trades, patterns, reflections
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('trade_outcome','meta_shift','self_reflection','market_pattern','ecosystem_data','curiosity','interaction')),
  content TEXT NOT NULL,
  context TEXT,
  token_address TEXT,
  token_symbol TEXT,
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- indexes for fast recall
CREATE INDEX IF NOT EXISTS idx_memory_type ON agent_memory(type);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON agent_memory(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_created ON agent_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_content_search ON agent_memory USING gin(to_tsvector('english', content));

-- agent_relationships: tracks X interactions per handle
CREATE TABLE IF NOT EXISTS agent_relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  sentiment TEXT NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative','ignored')),
  last_interaction TIMESTAMPTZ DEFAULT now(),
  interaction_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rel_handle ON agent_relationships(handle);
CREATE INDEX IF NOT EXISTS idx_rel_sentiment ON agent_relationships(sentiment);

-- cleanup function (call periodically to prune old low-value memories)
CREATE OR REPLACE FUNCTION cleanup_old_memories()
RETURNS void AS $$
BEGIN
  DELETE FROM agent_memory
  WHERE id IN (
    SELECT id FROM agent_memory
    WHERE importance <= 3
    AND created_at < now() - INTERVAL '7 days'
    ORDER BY created_at ASC
    LIMIT 100
  );
END;
$$ LANGUAGE plpgsql;

-- enable realtime on memory (optional, for dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE agent_memory;
