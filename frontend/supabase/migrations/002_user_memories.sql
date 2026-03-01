-- Technocracy: user_memories table with pgvector embeddings
-- Run this in your Supabase SQL Editor

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create the user_memories table
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  memory TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  source_question TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_created_at ON user_memories(created_at DESC);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding ON user_memories
  USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read their own memories
CREATE POLICY "Users can view own memories"
  ON user_memories
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own memories
CREATE POLICY "Users can insert own memories"
  ON user_memories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can delete their own memories
CREATE POLICY "Users can delete own memories"
  ON user_memories
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to match user memories by cosine similarity
CREATE OR REPLACE FUNCTION match_user_memories(
  query_embedding vector(1536),
  match_user_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  memory TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    user_memories.id,
    user_memories.memory,
    1 - (user_memories.embedding <=> query_embedding) AS similarity
  FROM user_memories
  WHERE user_memories.user_id = match_user_id
    AND 1 - (user_memories.embedding <=> query_embedding) > match_threshold
  ORDER BY user_memories.embedding <=> query_embedding
  LIMIT match_count;
$$;
