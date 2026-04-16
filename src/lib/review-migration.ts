export const REVIEW_MIGRATION_SQL = `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ChallengeReviewStatus'
  ) THEN
    CREATE TYPE public."ChallengeReviewStatus" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE public."ChallengeCompletion"
  ADD COLUMN IF NOT EXISTS "reviewStatus" public."ChallengeReviewStatus",
  ADD COLUMN IF NOT EXISTS "reviewedAt" timestamp without time zone,
  ADD COLUMN IF NOT EXISTS "postedAt" timestamp without time zone;

UPDATE public."ChallengeCompletion"
SET "reviewStatus" = 'pending'
WHERE "reviewStatus" IS NULL;

ALTER TABLE public."ChallengeCompletion"
  ALTER COLUMN "reviewStatus" SET DEFAULT 'pending',
  ALTER COLUMN "reviewStatus" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ChallengeCompletion_reviewStatus_idx"
  ON public."ChallengeCompletion" ("reviewStatus", "completedAt");
`;
