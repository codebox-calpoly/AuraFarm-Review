import "server-only";

import { db } from "@/lib/db";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type ReviewQueueKind = "pending" | "flagged";

export type ReviewFlag = {
  id: number;
  reason: string | null;
  createdAt: string;
  createdAtLabel: string;
  flaggedBy: string;
};

export type PendingReview = {
  completionId: number;
  reviewStatus: ReviewStatus;
  queueKind: ReviewQueueKind;
  queueLabel: string;
  queueDescription: string;
  caption: string | null;
  imageUrl: string;
  imageUri: string;
  likes: number;
  completedAt: string;
  completedAtLabel: string;
  completedAtShortLabel: string;
  completionLatitude: number;
  completionLongitude: number;
  completionDistanceMiles: number;
  user: {
    id: number;
    name: string;
    email: string;
    auraPoints: number;
    streak: number;
    createdAt: string;
  };
  challenge: {
    id: number;
    title: string;
    description: string;
    difficulty: string;
    pointsReward: number;
    latitude: number;
    longitude: number;
    photoGuidelines: string;
    createdAt: string;
  };
  flags: ReviewFlag[];
};

export type ReviewDashboardData =
  | {
      schemaReady: false;
    }
  | {
      schemaReady: true;
      stats: {
        pending: number;
        approved: number;
        rejected: number;
        flaggedPending: number;
        flaggedApproved: number;
      };
      nextReview: PendingReview | null;
    };

type StatsRow = {
  pending: number;
  approved: number;
  rejected: number;
  flaggedPending: number;
  flaggedApproved: number;
};

type PendingReviewRow = {
  completionId: number;
  reviewStatus: ReviewStatus;
  caption: string | null;
  imageUrl: string | null;
  imageUri: string;
  likes: number;
  completedAt: Date;
  completionLatitude: number;
  completionLongitude: number;
  userId: number;
  userName: string;
  userEmail: string;
  userAuraPoints: number;
  userStreak: number;
  userCreatedAt: Date;
  challengeId: number;
  challengeTitle: string;
  challengeDescription: string;
  challengeDifficulty: string;
  challengePointsReward: number;
  challengeLatitude: number;
  challengeLongitude: number;
  challengePhotoGuidelines: string;
  challengeCreatedAt: Date;
};

type FlagRow = {
  id: number;
  reason: string | null;
  createdAt: Date;
  flaggedBy: string;
};

const REVIEW_COLUMNS = ["reviewStatus", "reviewedAt", "postedAt"];
let schemaReadyCache = false;

export async function hasReviewSchema() {
  if (schemaReadyCache) {
    return true;
  }

  const result = await db.query<{ column_count: number }>(
    `
      SELECT COUNT(*)::int AS column_count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ChallengeCompletion'
        AND column_name = ANY($1::text[])
    `,
    [REVIEW_COLUMNS],
  );

  const isReady = result.rows[0]?.column_count === REVIEW_COLUMNS.length;

  if (isReady) {
    schemaReadyCache = true;
  }

  return isReady;
}

export async function getReviewDashboardData(
  options?: { skippedCompletionIds?: number[] },
): Promise<ReviewDashboardData> {
  const schemaReady = await hasReviewSchema();

  if (!schemaReady) {
    return { schemaReady: false };
  }

  const statsPromise = db.query<StatsRow>(`
    SELECT
      COUNT(*) FILTER (
        WHERE COALESCE(cc."reviewStatus"::text, 'pending') = 'pending'
      )::int AS pending,
      COUNT(*) FILTER (
        WHERE cc."reviewStatus"::text = 'approved'
      )::int AS approved,
      COUNT(*) FILTER (
        WHERE cc."reviewStatus"::text = 'rejected'
      )::int AS rejected,
      COUNT(*) FILTER (
        WHERE COALESCE(cc."reviewStatus"::text, 'pending') = 'pending'
          AND COALESCE(flag_counts.flag_count, 0) > 0
      )::int AS "flaggedPending"
      ,
      COUNT(*) FILTER (
        WHERE cc."reviewStatus"::text = 'approved'
          AND COALESCE(flag_counts.flag_count, 0) > 0
          AND (
            cc."reviewedAt" IS NULL
            OR flag_counts.latest_flag_at > cc."reviewedAt"
          )
      )::int AS "flaggedApproved"
    FROM public."ChallengeCompletion" cc
    LEFT JOIN (
      SELECT
        "completionId",
        COUNT(*)::int AS flag_count,
        MAX("createdAt") AS latest_flag_at
      FROM public."Flag"
      GROUP BY "completionId"
    ) AS flag_counts
      ON flag_counts."completionId" = cc.id
  `);

  const skippedCompletionIds = Array.from(
    new Set((options?.skippedCompletionIds ?? []).filter((value) => Number.isInteger(value) && value > 0)),
  );

  const nextReviewPromise = getNextReview(skippedCompletionIds);

  const [statsResult, nextReviewResult] = await Promise.all([
    statsPromise,
    nextReviewPromise,
  ]);

  const nextReviewRow = nextReviewResult.rows[0];

  if (!nextReviewRow && skippedCompletionIds.length > 0) {
    const fallbackResult = await getNextReview([]);
    return finalizeDashboard(statsResult.rows[0], fallbackResult.rows[0]);
  }

  return finalizeDashboard(statsResult.rows[0], nextReviewRow);
}

async function getNextReview(skippedCompletionIds: number[]) {
  return db.query<PendingReviewRow>(`
    SELECT
      cc.id AS "completionId",
      cc."reviewStatus"::text AS "reviewStatus",
      cc.caption,
      cc."imageUrl",
      cc."imageUri",
      cc.likes,
      cc."completedAt",
      cc.latitude AS "completionLatitude",
      cc.longitude AS "completionLongitude",
      u.id AS "userId",
      u.name AS "userName",
      u.email AS "userEmail",
      u."auraPoints" AS "userAuraPoints",
      u.streak AS "userStreak",
      u."createdAt" AS "userCreatedAt",
      c.id AS "challengeId",
      c.title AS "challengeTitle",
      c.description AS "challengeDescription",
      c.difficulty AS "challengeDifficulty",
      c."pointsReward" AS "challengePointsReward",
      c.latitude AS "challengeLatitude",
      c.longitude AS "challengeLongitude",
      c."photoGuidelines" AS "challengePhotoGuidelines",
      c."createdAt" AS "challengeCreatedAt"
    FROM public."ChallengeCompletion" cc
    INNER JOIN public."User" u
      ON u.id = cc."userId"
    INNER JOIN public."Challenge" c
      ON c.id = cc."challengeId"
    LEFT JOIN (
      SELECT
        "completionId",
        COUNT(*)::int AS flag_count,
        MAX("createdAt") AS latest_flag_at
      FROM public."Flag"
      GROUP BY "completionId"
    ) AS flag_counts
      ON flag_counts."completionId" = cc.id
    WHERE
      (
        COALESCE(cc."reviewStatus"::text, 'pending') = 'pending'
        OR (
          cc."reviewStatus"::text = 'approved'
          AND COALESCE(flag_counts.flag_count, 0) > 0
          AND (
            cc."reviewedAt" IS NULL
            OR flag_counts.latest_flag_at > cc."reviewedAt"
          )
        )
      )
      AND NOT (cc.id = ANY($1::int[]))
    ORDER BY
      CASE
        WHEN cc."reviewStatus"::text = 'approved'
          AND COALESCE(flag_counts.flag_count, 0) > 0
          AND (
            cc."reviewedAt" IS NULL
            OR flag_counts.latest_flag_at > cc."reviewedAt"
          )
        THEN 0
        ELSE 1
      END,
      COALESCE(flag_counts.latest_flag_at, cc."completedAt") DESC,
      cc."completedAt" ASC
    LIMIT 1
  `, [skippedCompletionIds]);
}

async function finalizeDashboard(
  stats: StatsRow,
  nextReviewRow: PendingReviewRow | undefined,
): Promise<ReviewDashboardData> {
  if (!nextReviewRow) {
    return {
      schemaReady: true,
      stats,
      nextReview: null,
    };
  }

  const flagsResult = await db.query<FlagRow>(
    `
      SELECT
        f.id,
        f.reason,
        f."createdAt" AS "createdAt",
        u.name AS "flaggedBy"
      FROM public."Flag" f
      INNER JOIN public."User" u
        ON u.id = f."flaggedById"
      WHERE f."completionId" = $1
      ORDER BY f."createdAt" DESC
    `,
    [nextReviewRow.completionId],
  );

  return {
    schemaReady: true,
    stats,
    nextReview: mapPendingReview(nextReviewRow, flagsResult.rows),
  };
}

function mapPendingReview(row: PendingReviewRow, flags: FlagRow[]): PendingReview {
  const queueKind: ReviewQueueKind =
    row.reviewStatus === "approved" && flags.length > 0 ? "flagged" : "pending";
  const queueLabel =
    queueKind === "flagged"
      ? "Flagged challenge"
      : flags.length > 0
        ? "Flagged pending submission"
        : "Pending submission";
  const queueDescription =
    queueKind === "flagged"
      ? "This completion was already approved and is back in review because users flagged it."
      : flags.length > 0
        ? "This pending submission already has moderation flags attached to it."
        : "This completion is waiting for its first moderation decision.";

  return {
    completionId: row.completionId,
    reviewStatus: row.reviewStatus,
    queueKind,
    queueLabel,
    queueDescription,
    caption: row.caption,
    imageUrl: row.imageUrl ?? row.imageUri,
    imageUri: row.imageUri,
    likes: row.likes,
    completedAt: row.completedAt.toISOString(),
    completedAtLabel: formatDisplayDate(row.completedAt),
    completedAtShortLabel: formatDisplayDate(row.completedAt, "short"),
    completionLatitude: row.completionLatitude,
    completionLongitude: row.completionLongitude,
    completionDistanceMiles: getDistanceMiles(
      row.challengeLatitude,
      row.challengeLongitude,
      row.completionLatitude,
      row.completionLongitude,
    ),
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      auraPoints: row.userAuraPoints,
      streak: row.userStreak,
      createdAt: row.userCreatedAt.toISOString(),
    },
    challenge: {
      id: row.challengeId,
      title: row.challengeTitle,
      description: row.challengeDescription,
      difficulty: row.challengeDifficulty,
      pointsReward: row.challengePointsReward,
      latitude: row.challengeLatitude,
      longitude: row.challengeLongitude,
      photoGuidelines: row.challengePhotoGuidelines,
      createdAt: row.challengeCreatedAt.toISOString(),
    },
    flags: flags.map((flag) => ({
      id: flag.id,
      reason: flag.reason,
      createdAt: flag.createdAt.toISOString(),
      createdAtLabel: formatDisplayDate(flag.createdAt),
      flaggedBy: flag.flaggedBy,
    })),
  };
}

function formatDisplayDate(value: Date, variant: "full" | "short" = "full") {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: variant === "full" ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });

  if (variant === "short") {
    return formatter.format(value).replace(",", " at");
  }

  return formatter.format(value);
}

function getDistanceMiles(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number,
) {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(endLatitude - startLatitude);
  const lonDelta = toRadians(endLongitude - startLongitude);
  const lat1 = toRadians(startLatitude);
  const lat2 = toRadians(endLatitude);

  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(haversine));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
