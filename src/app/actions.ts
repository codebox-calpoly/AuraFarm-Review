"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { createReviewAccessToken, grantReviewAccess, isValidReviewPassword } from "@/lib/review-access";
import { hasReviewSchema } from "@/lib/review-dashboard";

const LAST_REVIEW_ACTION_COOKIE = "auraFarmLastReviewAction";
const SKIPPED_REVIEW_IDS_COOKIE = "auraFarmSkippedReviewIds";
const DEFAULT_CHALLENGE_LATITUDE = 35.302;
const DEFAULT_CHALLENGE_LONGITUDE = -120.668;
const CHALLENGE_TAG_OPTIONS = new Set<string>([
  "sports",
  "outdoors",
  "clubs",
  "campus",
  "beach",
  "volunteering",
  "arts_culture",
  "misc",
] as const);
const CHALLENGE_DIFFICULTY_OPTIONS = new Set<string>(["easy", "medium", "hard"]);
const MAX_BULK_CHALLENGES = 100;
const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_PHOTO_GUIDELINES_LENGTH = 4000;
const MAX_TAGS_PER_CHALLENGE = 5;
const ALLOWED_BULK_KEYS = new Set([
  "title",
  "description",
  "difficulty",
  "pointsReward",
  "photoGuidelines",
  "tags",
]);

type LastReviewAction = {
  action: "approve" | "reject";
  completionId: number;
  challengeTitle: string;
  previousStatus: "pending" | "approved";
  previousReviewedAt: string | null;
  previousPostedAt: string | null;
};

export type CreateChallengeFormState = {
  error: string | null;
  fieldErrors: Partial<Record<"title" | "description" | "difficulty" | "pointsReward" | "photoGuidelines" | "tags", string>>;
  successMessage: string | null;
};

export type BulkCreateChallengeFormState = {
  error: string | null;
  successMessage: string | null;
};

export type UnlockReviewAppState = {
  error: string | null;
  success: boolean;
  accessToken: string | null;
};

type ChallengeDraft = {
  title: string;
  description: string;
  difficulty: string;
  pointsReward: number;
  photoGuidelines: string;
  tags: string[];
};

function parseCompletionId(formData: FormData) {
  const rawCompletionId = formData.get("completionId");
  const completionId = Number(rawCompletionId);

  if (!Number.isInteger(completionId) || completionId <= 0) {
    throw new Error("A valid completionId is required.");
  }

  return completionId;
}

async function assertReviewSchema() {
  const schemaReady = await hasReviewSchema();

  if (!schemaReady) {
    throw new Error("Review schema has not been migrated yet.");
  }
}

async function setLastReviewActionCookie(value: LastReviewAction) {
  const cookieStore = await cookies();
  cookieStore.set(LAST_REVIEW_ACTION_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 30,
  });
}

export async function unlockReviewApp(
  _previousState: UnlockReviewAppState,
  formData: FormData,
): Promise<UnlockReviewAppState> {
  const password = getTrimmedString(formData.get("password"));

  if (!password) {
    return {
      error: "Password is required.",
      success: false,
      accessToken: null,
    };
  }

  if (!isValidReviewPassword(password)) {
    return {
      error: "Incorrect password.",
      success: false,
      accessToken: null,
    };
  }

  const cookieStore = await cookies();
  grantReviewAccess(cookieStore);

  return {
    error: null,
    success: true,
    accessToken: createReviewAccessToken(),
  };
}

async function clearLastReviewActionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_REVIEW_ACTION_COOKIE);
}

async function getSkippedReviewIdsCookieValue() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(SKIPPED_REVIEW_IDS_COOKIE)?.value;

  if (!rawCookie) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawCookie) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is number => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

async function setSkippedReviewIdsCookieValue(completionIds: number[]) {
  const cookieStore = await cookies();

  if (completionIds.length === 0) {
    cookieStore.delete(SKIPPED_REVIEW_IDS_COOKIE);
    return;
  }

  cookieStore.set(SKIPPED_REVIEW_IDS_COOKIE, JSON.stringify(completionIds), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
}

async function removeSkippedReviewId(completionId: number) {
  const skippedIds = await getSkippedReviewIdsCookieValue();

  if (!skippedIds.includes(completionId)) {
    return;
  }

  await setSkippedReviewIdsCookieValue(
    skippedIds.filter((skippedId) => skippedId !== completionId),
  );
}

function parseUndoAction(formData: FormData) {
  const rawAction = formData.get("action");

  if (rawAction !== "approve" && rawAction !== "reject") {
    throw new Error("A valid action is required.");
  }

  return rawAction;
}

export async function approveCompletion(formData: FormData) {
  await assertReviewSchema();

  const completionId = parseCompletionId(formData);
  const client = await db.connect();
  let lastAction: LastReviewAction | null = null;

  try {
    await client.query("BEGIN");

    const completionResult = await client.query<{
      reviewStatus: "pending" | "approved";
      reviewedAt: Date | null;
      postedAt: Date | null;
      userId: number;
      challengeId: number;
      challengeTitle: string;
    }>(
      `
        SELECT
          cc."reviewStatus"::text AS "reviewStatus",
          cc."reviewedAt",
          cc."postedAt",
          cc."userId",
          cc."challengeId",
          c.title AS "challengeTitle"
        FROM public."ChallengeCompletion" AS cc
        INNER JOIN public."Challenge" AS c
          ON c.id = cc."challengeId"
        WHERE
          cc.id = $1
          AND cc."reviewStatus"::text IN ('pending', 'approved')
        FOR UPDATE
      `,
      [completionId],
    );

    if (completionResult.rowCount === 0) {
      await client.query("ROLLBACK");
      revalidatePath("/");
      revalidatePath("/reviewing");
      return;
    }

    const completion = completionResult.rows[0];

    await client.query(
      `
        UPDATE public."ChallengeCompletion"
        SET
          "reviewStatus" = 'approved',
          "reviewedAt" = CURRENT_TIMESTAMP,
          "postedAt" = COALESCE("postedAt", CURRENT_TIMESTAMP)
        WHERE id = $1
      `,
      [completionId],
    );

    if (completion.reviewStatus === "pending") {
      await client.query(
        `
          UPDATE public."User" AS u
          SET "auraPoints" = u."auraPoints" + c."pointsReward"
          FROM public."Challenge" AS c
          WHERE u.id = $1
            AND c.id = $2
        `,
        [completion.userId, completion.challengeId],
      );
    }

    lastAction = {
      action: "approve",
      completionId,
      challengeTitle: completion.challengeTitle,
      previousStatus: completion.reviewStatus,
      previousReviewedAt: completion.reviewedAt?.toISOString() ?? null,
      previousPostedAt: completion.postedAt?.toISOString() ?? null,
    };

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (lastAction) {
    await setLastReviewActionCookie(lastAction);
  }

  await removeSkippedReviewId(completionId);

  revalidatePath("/");
  revalidatePath("/reviewing");
}

export async function rejectCompletion(formData: FormData) {
  await assertReviewSchema();

  const completionId = parseCompletionId(formData);
  const client = await db.connect();
  let lastAction: LastReviewAction | null = null;

  try {
    await client.query("BEGIN");

    const completionResult = await client.query<{
      reviewStatus: "pending" | "approved";
      reviewedAt: Date | null;
      postedAt: Date | null;
      userId: number;
      challengeId: number;
      challengeTitle: string;
    }>(
      `
        SELECT
          cc."reviewStatus"::text AS "reviewStatus",
          cc."reviewedAt",
          cc."postedAt",
          cc."userId",
          cc."challengeId",
          c.title AS "challengeTitle"
        FROM public."ChallengeCompletion" AS cc
        INNER JOIN public."Challenge" AS c
          ON c.id = cc."challengeId"
        WHERE cc.id = $1
          AND cc."reviewStatus"::text IN ('pending', 'approved')
        FOR UPDATE
      `,
      [completionId],
    );

    if (completionResult.rowCount === 0) {
      await client.query("ROLLBACK");
      revalidatePath("/");
      revalidatePath("/reviewing");
      return;
    }

    const completion = completionResult.rows[0];

    await client.query(
      `
        UPDATE public."ChallengeCompletion"
        SET
          "reviewStatus" = 'rejected',
          "reviewedAt" = CURRENT_TIMESTAMP,
          "postedAt" = NULL
        WHERE id = $1
      `,
      [completionId],
    );

    if (completion.reviewStatus === "approved") {
      await client.query(
        `
          UPDATE public."User" AS u
          SET "auraPoints" = u."auraPoints" - c."pointsReward"
          FROM public."Challenge" AS c
          WHERE u.id = $1
            AND c.id = $2
        `,
        [completion.userId, completion.challengeId],
      );
    }

    lastAction = {
      action: "reject",
      completionId,
      challengeTitle: completion.challengeTitle,
      previousStatus: completion.reviewStatus,
      previousReviewedAt: completion.reviewedAt?.toISOString() ?? null,
      previousPostedAt: completion.postedAt?.toISOString() ?? null,
    };

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (lastAction) {
    await setLastReviewActionCookie(lastAction);
  }

  await removeSkippedReviewId(completionId);

  revalidatePath("/");
  revalidatePath("/reviewing");
}

export async function undoReviewDecision(formData: FormData) {
  await assertReviewSchema();

  const completionId = parseCompletionId(formData);
  const fallbackAction = parseUndoAction(formData);
  const client = await db.connect();
  const lastAction = await getStoredLastReviewAction();
  const action =
    lastAction && lastAction.completionId === completionId
      ? lastAction.action
      : fallbackAction;

  try {
    await client.query("BEGIN");

    if (action === "approve") {
      if (lastAction?.previousStatus === "approved") {
        await client.query(
          `
            UPDATE public."ChallengeCompletion"
            SET
              "reviewStatus" = 'approved',
              "reviewedAt" = $2::timestamp,
              "postedAt" = $3::timestamp
            WHERE id = $1
              AND "reviewStatus"::text = 'approved'
          `,
          [completionId, lastAction.previousReviewedAt, lastAction.previousPostedAt],
        );
      } else {
        const undoResult = await client.query<{
          userId: number;
          challengeId: number;
        }>(
          `
            UPDATE public."ChallengeCompletion" AS cc
            SET
              "reviewStatus" = 'pending',
              "reviewedAt" = NULL,
              "postedAt" = NULL
            WHERE cc.id = $1
              AND cc."reviewStatus"::text = 'approved'
            RETURNING cc."userId", cc."challengeId"
          `,
          [completionId],
        );

        if (undoResult.rowCount) {
          const restoredCompletion = undoResult.rows[0];
          await client.query(
            `
              UPDATE public."User" AS u
              SET "auraPoints" = u."auraPoints" - c."pointsReward"
              FROM public."Challenge" AS c
              WHERE u.id = $1
                AND c.id = $2
            `,
            [restoredCompletion.userId, restoredCompletion.challengeId],
          );
        }
      }
    } else {
      if (lastAction?.previousStatus === "approved") {
        const restoreResult = await client.query<{
          userId: number;
          challengeId: number;
        }>(
          `
            UPDATE public."ChallengeCompletion" AS cc
            SET
              "reviewStatus" = 'approved',
              "reviewedAt" = $2::timestamp,
              "postedAt" = $3::timestamp
            WHERE cc.id = $1
              AND cc."reviewStatus"::text = 'rejected'
            RETURNING cc."userId", cc."challengeId"
          `,
          [completionId, lastAction.previousReviewedAt, lastAction.previousPostedAt],
        );

        if (restoreResult.rowCount) {
          const restoredCompletion = restoreResult.rows[0];
          await client.query(
            `
              UPDATE public."User" AS u
              SET "auraPoints" = u."auraPoints" + c."pointsReward"
              FROM public."Challenge" AS c
              WHERE u.id = $1
                AND c.id = $2
            `,
            [restoredCompletion.userId, restoredCompletion.challengeId],
          );
        }
      } else {
        await client.query(
          `
            UPDATE public."ChallengeCompletion"
            SET
              "reviewStatus" = 'pending',
              "reviewedAt" = NULL,
              "postedAt" = NULL
            WHERE id = $1
              AND "reviewStatus"::text = 'rejected'
          `,
          [completionId],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await clearLastReviewActionCookie();

  revalidatePath("/");
  revalidatePath("/reviewing");
}

export async function skipReview(formData: FormData) {
  const completionId = parseCompletionId(formData);
  const skippedIds = await getSkippedReviewIdsCookieValue();

  if (!skippedIds.includes(completionId)) {
    await setSkippedReviewIdsCookieValue([...skippedIds, completionId]);
  }

  revalidatePath("/reviewing");
}

export async function createChallenge(
  _previousState: CreateChallengeFormState,
  formData: FormData,
): Promise<CreateChallengeFormState> {
  const title = getTrimmedString(formData.get("title"));
  const description = getTrimmedString(formData.get("description"));
  const difficulty = getTrimmedString(formData.get("difficulty"));
  const photoGuidelines = getTrimmedString(formData.get("photoGuidelines"));
  const rawPointsReward = getTrimmedString(formData.get("pointsReward"));
  const pointsReward = Number(rawPointsReward);
  const tags = formData
    .getAll("tags")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  const [challenge, fieldErrors] = validateChallengeDraft({
    title,
    description,
    difficulty,
    photoGuidelines,
    pointsReward,
    tags,
  });

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "The challenge could not be created yet. Fix the highlighted fields.",
      fieldErrors,
      successMessage: null,
    };
  }

  try {
    await insertChallenges([challenge]);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unknown database error while creating challenge.",
      fieldErrors: {},
      successMessage: null,
    };
  }

  revalidatePath("/");
  revalidatePath("/add-challenge");

  return {
    error: null,
    fieldErrors: {},
    successMessage: "Challenge added successfully.",
  };
}

export async function createChallengesBulk(
  _previousState: BulkCreateChallengeFormState,
  formData: FormData,
): Promise<BulkCreateChallengeFormState> {
  const rawPayload = getTrimmedString(formData.get("payload"));

  if (!rawPayload) {
    return {
      error: "Paste a JSON array of challenges before submitting.",
      successMessage: null,
    };
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch {
    return {
      error: "Bulk add expects valid JSON.",
      successMessage: null,
    };
  }

  if (!Array.isArray(parsedPayload) || parsedPayload.length === 0) {
    return {
      error: "Bulk add expects a non-empty JSON array.",
      successMessage: null,
    };
  }

  if (parsedPayload.length > MAX_BULK_CHALLENGES) {
    return {
      error: `Bulk add is limited to ${MAX_BULK_CHALLENGES} challenges per submission.`,
      successMessage: null,
    };
  }

  const challenges: ChallengeDraft[] = [];
  const validationErrors: string[] = [];

  parsedPayload.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      validationErrors.push(`Row ${index + 1}: each item must be an object.`);
      return;
    }

    const record = entry as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter((key) => !ALLOWED_BULK_KEYS.has(key));

    if (unknownKeys.length > 0) {
      validationErrors.push(
        `Row ${index + 1}: unsupported keys: ${unknownKeys.join(", ")}.`,
      );
      return;
    }

    const [challenge, fieldErrors] = validateChallengeDraft({
      title: normalizeUnknownString(record.title),
      description: normalizeUnknownString(record.description),
      difficulty: normalizeUnknownString(record.difficulty),
      photoGuidelines: normalizeUnknownString(record.photoGuidelines),
      pointsReward:
        typeof record.pointsReward === "number"
          ? record.pointsReward
          : Number(normalizeUnknownString(record.pointsReward)),
      tags: Array.isArray(record.tags)
        ? record.tags.map((tag) => normalizeUnknownString(tag)).filter(Boolean)
        : [],
    });

    if (Object.keys(fieldErrors).length > 0) {
      validationErrors.push(`Row ${index + 1}: ${Object.values(fieldErrors).join(" ")}`);
      return;
    }

    challenges.push(challenge);
  });

  if (validationErrors.length > 0) {
    return {
      error: validationErrors.join(" "),
      successMessage: null,
    };
  }

  try {
    await insertChallenges(challenges);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unknown database error while bulk creating challenges.",
      successMessage: null,
    };
  }

  revalidatePath("/");
  revalidatePath("/add-challenge");

  return {
    error: null,
    successMessage: `Added ${challenges.length} challenges successfully.`,
  };
}

async function getStoredLastReviewAction(): Promise<LastReviewAction | null> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(LAST_REVIEW_ACTION_COOKIE)?.value;

  if (!rawCookie) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawCookie) as LastReviewAction;

    if (
      (parsed.action === "approve" || parsed.action === "reject") &&
      Number.isInteger(parsed.completionId) &&
      typeof parsed.challengeTitle === "string" &&
      (parsed.previousStatus === "pending" || parsed.previousStatus === "approved")
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function getTrimmedString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUnknownString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateChallengeDraft(draft: ChallengeDraft): [ChallengeDraft, CreateChallengeFormState["fieldErrors"]] {
  const normalizedDraft: ChallengeDraft = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    difficulty: draft.difficulty.trim().toLowerCase(),
    photoGuidelines: draft.photoGuidelines.trim(),
    pointsReward: Number(draft.pointsReward),
    tags: Array.from(new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))),
  };
  const fieldErrors: CreateChallengeFormState["fieldErrors"] = {};

  if (!normalizedDraft.title) {
    fieldErrors.title = "Title is required.";
  } else if (normalizedDraft.title.length > MAX_TITLE_LENGTH) {
    fieldErrors.title = `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }

  if (!normalizedDraft.description) {
    fieldErrors.description = "Description is required.";
  } else if (normalizedDraft.description.length > MAX_DESCRIPTION_LENGTH) {
    fieldErrors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (!normalizedDraft.difficulty) {
    fieldErrors.difficulty = "Difficulty is required.";
  } else if (!CHALLENGE_DIFFICULTY_OPTIONS.has(normalizedDraft.difficulty)) {
    fieldErrors.difficulty = "Difficulty must be easy, medium, or hard.";
  }

  if (
    !Number.isSafeInteger(normalizedDraft.pointsReward) ||
    normalizedDraft.pointsReward <= 0
  ) {
    fieldErrors.pointsReward = "Points reward must be a positive whole number.";
  }

  if (normalizedDraft.photoGuidelines.length > MAX_PHOTO_GUIDELINES_LENGTH) {
    fieldErrors.photoGuidelines =
      `Photo guidelines must be ${MAX_PHOTO_GUIDELINES_LENGTH} characters or fewer.`;
  }

  if (!normalizedDraft.tags.length) {
    fieldErrors.tags = "Select at least one tag.";
  } else if (normalizedDraft.tags.length > MAX_TAGS_PER_CHALLENGE) {
    fieldErrors.tags = `Select no more than ${MAX_TAGS_PER_CHALLENGE} tags.`;
  } else if (normalizedDraft.tags.some((tag) => !CHALLENGE_TAG_OPTIONS.has(tag))) {
    fieldErrors.tags = "One or more selected tags are invalid.";
  }

  return [normalizedDraft, fieldErrors];
}

async function insertChallenges(challenges: ChallengeDraft[]) {
  if (challenges.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders = challenges.map((challenge, index) => {
    const offset = index * 8;
    values.push(
      challenge.title,
      challenge.description,
      DEFAULT_CHALLENGE_LATITUDE,
      DEFAULT_CHALLENGE_LONGITUDE,
      challenge.difficulty,
      challenge.pointsReward,
      challenge.photoGuidelines,
      challenge.tags,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::"ChallengeCategory"[])`;
  });

  await db.query(
    `
      INSERT INTO public."Challenge" (
        title,
        description,
        latitude,
        longitude,
        difficulty,
        "pointsReward",
        "photoGuidelines",
        tags
      )
      VALUES ${placeholders.join(", ")}
    `,
    values,
  );
}
