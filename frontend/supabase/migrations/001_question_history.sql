-- Technocracy: question_history table with RLS
-- Run this in your Supabase SQL Editor

-- Create the question_history table
CREATE TABLE IF NOT EXISTS question_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  clustered_results JSONB NOT NULL DEFAULT '{"themes":[],"total_agents":0}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_question_history_user_id ON question_history(user_id);
CREATE INDEX IF NOT EXISTS idx_question_history_created_at ON question_history(created_at DESC);

-- Enable Row Level Security
ALTER TABLE question_history ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read their own rows
CREATE POLICY "Users can view own history"
  ON question_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can insert their own rows
CREATE POLICY "Users can insert own history"
  ON question_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can delete their own rows
CREATE POLICY "Users can delete own history"
  ON question_history
  FOR DELETE
  USING (auth.uid() = user_id);
