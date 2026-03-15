# Technocracy — Supabase Schema

All tables use Supabase Auth (`auth.users`) as the user identity. All tables have Row Level Security (RLS) enabled — users can only access their own rows.

## Tables

### `question_history` (migration 001)
Stores the final clustered result for each deliberation a user runs.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `question` | `text` | The question asked |
| `clustered_results` | `jsonb` | `{ themes: ThemeCluster[], total_agents: number }` |
| `created_at` | `timestamptz` | Auto-set |

**Indexes:** `user_id`, `created_at DESC`

**RLS policies:** SELECT, INSERT, DELETE for own rows.

---

### `user_memories` (migration 002)
Extracted facts about the user, stored with vector embeddings for semantic recall.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `memory` | `text` | A single extracted fact about the user |
| `embedding` | `vector(1536)` | text-embedding-3-small embedding |
| `source_question` | `text` | The question that triggered extraction (nullable) |
| `created_at` | `timestamptz` | Auto-set |

**Extensions required:** `pgvector` (via `CREATE EXTENSION vector WITH SCHEMA extensions`)

**Indexes:** `user_id`, `created_at DESC`, HNSW index on `embedding` (cosine)

**RLS policies:** SELECT, INSERT, DELETE for own rows.

**Functions:**
- `match_user_memories(query_embedding, match_user_id, match_threshold, match_count)` — returns memories with cosine similarity above threshold, ordered by similarity DESC.

---

### `custom_agents` (migration 003)
User-created agents, either manually entered or imported from LinkedIn.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `sprite_id` | `int` | 1–1000, selects character sprite |
| `name` | `text` | Agent display name (max 50 chars enforced in API) |
| `persona` | `text` | Character brief for the simulation (max 500 chars enforced in API) |
| `created_at` | `timestamptz` | Auto-set |

**RLS policies:** ALL operations for own rows (single policy with `using` and `with check`).

---

### `usage` (migration 004)
Monthly usage counters per user. Used for tracking (not yet for hard enforcement).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `month` | `text` | Format: `YYYY-MM` |
| `questions_used` | `numeric` | Full questions = 1.0, follow-ups = 0.25 |
| `linkedin_imports_used` | `integer` | Count of LinkedIn imports |
| `voice_usage_seconds` | `integer` | Seconds of voice input |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Updated on each increment |

**Constraints:** UNIQUE on `(user_id, month)`

**Indexes:** `user_id`, `month`

**RLS policies:** SELECT, INSERT, UPDATE for own rows.

**Functions:**
- `increment_usage(p_month, p_questions, p_linkedin, p_voice)` — atomic upsert via `SECURITY DEFINER`. Increments counters or inserts a new row. Validates `auth.uid()` is set.

---

### `user_plans` (migration 005)
Subscription tier and quotas per user. Auto-created for every new user via trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, auto-generated |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE, UNIQUE |
| `tier` | `text` | `free` / `pro` / `team` |
| `questions_quota` | `integer` | Monthly question allowance; `-1` = unlimited |
| `linkedin_quota` | `integer` | Monthly LinkedIn import allowance; `-1` = unlimited |
| `stripe_customer_id` | `text` | Nullable, set on first payment |
| `stripe_subscription_id` | `text` | Nullable, set when subscribed |
| `created_at` / `updated_at` | `timestamptz` | Auto-set |

**Tier defaults:** free = 5 questions / 1 LinkedIn; pro = 100 / 20; team = unlimited (-1)

**RLS policies:** SELECT for own row only. Writes are via `SECURITY DEFINER` functions only.

**Trigger:** `on_auth_user_created` — inserts a free plan row for every new `auth.users` row.

**Functions:**
- `check_and_increment_usage(p_user_id, p_month, p_questions, p_linkedin)` — atomically checks quota and increments if allowed. Returns `{ ok, tier }` or `{ ok: false, reason, used, quota, tier }`. Called from API routes (not client).
- `create_default_plan()` — trigger function, creates free plan on signup.

---

## Applying migrations

Run each file in order in the Supabase SQL Editor:

```
supabase/migrations/001_question_history.sql
supabase/migrations/002_user_memories.sql
supabase/migrations/003_custom_agents.sql
supabase/migrations/004_usage_tracking.sql
```

Or use the Supabase CLI:
```bash
supabase db push
```
