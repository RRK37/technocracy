-- Technocracy: usage table with RLS
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month TEXT NOT NULL, -- Format: 'YYYY-MM'
  questions_used NUMERIC DEFAULT 0 NOT NULL,
  linkedin_imports_used INTEGER DEFAULT 0 NOT NULL,
  voice_usage_seconds INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_month ON usage(month);

-- Enable RLS
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own usage"
  ON usage
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON usage
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage"
  ON usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create a secure RPC function to atomically increment usage.
CREATE OR REPLACE FUNCTION increment_usage(
  p_month TEXT,
  p_questions NUMERIC DEFAULT 0,
  p_linkedin INTEGER DEFAULT 0,
  p_voice INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO usage (user_id, month, questions_used, linkedin_imports_used, voice_usage_seconds)
  VALUES (v_user_id, p_month, p_questions, p_linkedin, p_voice)
  ON CONFLICT (user_id, month) DO UPDATE
  SET
    questions_used = usage.questions_used + EXCLUDED.questions_used,
    linkedin_imports_used = usage.linkedin_imports_used + EXCLUDED.linkedin_imports_used,
    voice_usage_seconds = usage.voice_usage_seconds + EXCLUDED.voice_usage_seconds,
    updated_at = now();
END;
$$;
