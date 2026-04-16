-- AuraFarm Review Dashboard SQL
-- This file includes the schema migration required by the dashboard,
-- plus the diagnostic queries used during implementation.

-- =========================================================
-- 1. Review schema migration
-- =========================================================

DO $$
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


-- =========================================================
-- 2. Column inspection queries used during implementation
-- =========================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'User'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Challenge'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ChallengeCompletion'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'CompletionLike'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Flag'
ORDER BY ordinal_position;


-- =========================================================
-- 3. Data checks used during implementation
-- =========================================================

SELECT count(*)::int AS count
FROM public."ChallengeCompletion";

SELECT count(*)::int AS count
FROM public."Flag";


-- =========================================================
-- 4. Sample queue review query used during implementation
-- =========================================================

SELECT
  cc.id,
  cc."userId",
  u.name AS user_name,
  u.email AS user_email,
  u."auraPoints",
  c.id AS challenge_id,
  c.title,
  c.difficulty,
  c."pointsReward",
  c."photoGuidelines",
  cc.caption,
  cc."imageUrl",
  cc."imageUri",
  cc."completedAt",
  cc.latitude,
  cc.longitude,
  coalesce(flag_counts.flag_count, 0) AS flag_count
FROM public."ChallengeCompletion" cc
JOIN public."User" u
  ON u.id = cc."userId"
JOIN public."Challenge" c
  ON c.id = cc."challengeId"
LEFT JOIN (
  SELECT "completionId", count(*)::int AS flag_count
  FROM public."Flag"
  GROUP BY "completionId"
) flag_counts
  ON flag_counts."completionId" = cc.id
ORDER BY cc."completedAt" ASC
LIMIT 5;


-- =========================================================
-- 5. Flag detail query used during implementation
-- =========================================================

SELECT
  f.id,
  f.reason,
  f."createdAt",
  u.name AS flagged_by
FROM public."Flag" f
JOIN public."User" u
  ON u.id = f."flaggedById"
ORDER BY f."createdAt" DESC
LIMIT 5;
