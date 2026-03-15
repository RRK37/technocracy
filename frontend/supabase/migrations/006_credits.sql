-- Technocracy: credit packs
-- Run after 005_user_plans.sql

-- Add credits balance to user_plans
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS credits NUMERIC NOT NULL DEFAULT 0;

-- Function called from the Stripe webhook to add credits after payment
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_credits NUMERIC)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE user_plans
  SET credits = credits + p_credits, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Update check_and_increment_usage to spend credits first, fall back to monthly quota
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_user_id   UUID,
  p_month     TEXT,
  p_questions NUMERIC DEFAULT 0,
  p_linkedin  INTEGER DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan           user_plans%ROWTYPE;
  v_questions_used NUMERIC;
  v_linkedin_used  INTEGER;
  v_source         TEXT;
BEGIN
  SELECT * INTO v_plan FROM user_plans WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_plans (user_id) VALUES (p_user_id) RETURNING * INTO v_plan;
  END IF;

  -- ── Questions ─────────────────────────────────────────────────────
  IF p_questions > 0 THEN
    IF v_plan.credits >= p_questions THEN
      -- Spend from credit balance
      UPDATE user_plans
      SET credits = credits - p_questions, updated_at = now()
      WHERE user_id = p_user_id;
      v_source := 'credits';
    ELSE
      -- Fall back to monthly quota
      SELECT COALESCE(questions_used, 0) INTO v_questions_used
      FROM usage WHERE user_id = p_user_id AND month = p_month;
      IF NOT FOUND THEN v_questions_used := 0; END IF;

      IF v_plan.questions_quota >= 0 AND (v_questions_used + p_questions) > v_plan.questions_quota THEN
        RETURN jsonb_build_object(
          'ok',     false,
          'reason', 'questions_quota_exceeded',
          'used',   v_questions_used,
          'quota',  v_plan.questions_quota,
          'tier',   v_plan.tier
        );
      END IF;
      v_source := 'quota';
    END IF;
  END IF;

  -- ── LinkedIn ──────────────────────────────────────────────────────
  IF p_linkedin > 0 THEN
    SELECT COALESCE(linkedin_imports_used, 0) INTO v_linkedin_used
    FROM usage WHERE user_id = p_user_id AND month = p_month;
    IF NOT FOUND THEN v_linkedin_used := 0; END IF;

    IF v_plan.linkedin_quota >= 0 AND (v_linkedin_used + p_linkedin) > v_plan.linkedin_quota THEN
      RETURN jsonb_build_object(
        'ok',     false,
        'reason', 'linkedin_quota_exceeded',
        'used',   v_linkedin_used,
        'quota',  v_plan.linkedin_quota,
        'tier',   v_plan.tier
      );
    END IF;
  END IF;

  -- Record usage for analytics regardless of source
  INSERT INTO usage (user_id, month, questions_used, linkedin_imports_used)
  VALUES (p_user_id, p_month, p_questions, p_linkedin)
  ON CONFLICT (user_id, month) DO UPDATE SET
    questions_used        = usage.questions_used + EXCLUDED.questions_used,
    linkedin_imports_used = usage.linkedin_imports_used + EXCLUDED.linkedin_imports_used,
    updated_at            = now();

  RETURN jsonb_build_object('ok', true, 'tier', v_plan.tier, 'source', COALESCE(v_source, 'quota'));
END;
$$;
