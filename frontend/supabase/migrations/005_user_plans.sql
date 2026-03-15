-- Technocracy: user_plans table and server-side quota enforcement
-- Run this in your Supabase SQL Editor

-- ── Plans table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_plans (
  id                     UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                UUID    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tier                   TEXT    NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team')),
  questions_quota        INTEGER NOT NULL DEFAULT 5,   -- monthly limit; -1 = unlimited
  linkedin_quota         INTEGER NOT NULL DEFAULT 1,   -- monthly limit; -1 = unlimited
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at             TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);

ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

-- Users can read their own plan
CREATE POLICY "Users can view own plan"
  ON user_plans FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update plans (done via SECURITY DEFINER functions)

-- ── Auto-create free plan for every new user ───────────────────────

CREATE OR REPLACE FUNCTION create_default_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_plans (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_plan();

-- ── Atomic quota check + increment (called from API routes) ────────
--
-- Returns:
--   { ok: true, tier: "free" }                          — allowed, usage recorded
--   { ok: false, reason: "questions_quota_exceeded",    — blocked
--     used: N, quota: N, tier: "free" }

CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_user_id  UUID,
  p_month    TEXT,
  p_questions NUMERIC DEFAULT 0,
  p_linkedin  INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan             user_plans%ROWTYPE;
  v_questions_used   NUMERIC;
  v_linkedin_used    INTEGER;
BEGIN
  -- Get or create plan
  SELECT * INTO v_plan FROM user_plans WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_plans (user_id) VALUES (p_user_id) RETURNING * INTO v_plan;
  END IF;

  -- Get current month usage
  SELECT COALESCE(questions_used, 0), COALESCE(linkedin_imports_used, 0)
  INTO v_questions_used, v_linkedin_used
  FROM usage WHERE user_id = p_user_id AND month = p_month;

  IF NOT FOUND THEN
    v_questions_used := 0;
    v_linkedin_used  := 0;
  END IF;

  -- Check questions quota (-1 = unlimited)
  IF p_questions > 0 AND v_plan.questions_quota >= 0 THEN
    IF (v_questions_used + p_questions) > v_plan.questions_quota THEN
      RETURN jsonb_build_object(
        'ok',     false,
        'reason', 'questions_quota_exceeded',
        'used',   v_questions_used,
        'quota',  v_plan.questions_quota,
        'tier',   v_plan.tier
      );
    END IF;
  END IF;

  -- Check linkedin quota (-1 = unlimited)
  IF p_linkedin > 0 AND v_plan.linkedin_quota >= 0 THEN
    IF (v_linkedin_used + p_linkedin) > v_plan.linkedin_quota THEN
      RETURN jsonb_build_object(
        'ok',     false,
        'reason', 'linkedin_quota_exceeded',
        'used',   v_linkedin_used,
        'quota',  v_plan.linkedin_quota,
        'tier',   v_plan.tier
      );
    END IF;
  END IF;

  -- Allowed — record usage
  INSERT INTO usage (user_id, month, questions_used, linkedin_imports_used)
  VALUES (p_user_id, p_month, p_questions, p_linkedin)
  ON CONFLICT (user_id, month) DO UPDATE SET
    questions_used        = usage.questions_used + EXCLUDED.questions_used,
    linkedin_imports_used = usage.linkedin_imports_used + EXCLUDED.linkedin_imports_used,
    updated_at            = now();

  RETURN jsonb_build_object('ok', true, 'tier', v_plan.tier);
END;
$$;

-- ── Backfill plans for any existing users ─────────────────────────

INSERT INTO user_plans (user_id)
SELECT id FROM auth.users
ON CONFLICT DO NOTHING;
