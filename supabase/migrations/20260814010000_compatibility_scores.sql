-- Cache for the admin "compare one member against the whole pool" matrix.
--
-- One row per (subject, candidate, rubric version). Clicking a member in the
-- admin UI must not trigger a fresh paid OpenAI run every time, so results are
-- persisted and served from here unless the admin explicitly asks to refresh.
--
-- rubric_version is bumped by hand whenever the fixed rubric changes
-- (SECTION_WEIGHTS or answerSimilarity in src/lib/compatibility.server.ts).
-- Rows for an older rubric version are simply never read again.

CREATE TABLE IF NOT EXISTS public.compatibility_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rubric_version    text NOT NULL,
  fixed_score       integer NOT NULL,
  openai_score      integer,
  final_score       integer NOT NULL,
  scoring_method    text NOT NULL,
  strengths         text,
  considerations    text,
  openai_model      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compatibility_scores_pair_version_key
    UNIQUE (subject_user_id, candidate_user_id, rubric_version)
);

-- The matrix is always read as "this subject, best first".
CREATE INDEX IF NOT EXISTS compatibility_scores_subject_score_idx
  ON public.compatibility_scores (subject_user_id, final_score DESC);

GRANT ALL ON public.compatibility_scores TO service_role;

-- RLS is enabled with NO policies, which denies every anon and authenticated
-- request outright. This is deliberately stricter than public.stripe_events
-- (which grants admins a SELECT policy): these rows are derived compatibility
-- judgements about named members, so they are reachable only through the
-- service-role client inside handlers that have already called assertAdmin().
ALTER TABLE public.compatibility_scores ENABLE ROW LEVEL SECURITY;
