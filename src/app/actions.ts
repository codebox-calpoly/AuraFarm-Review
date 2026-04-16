"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { hasReviewSchema } from "@/lib/review-dashboard";

const LAST_REVIEW_ACTION_COOKIE = "auraFarmLastReviewAction";

type LastReviewAction = {
  action: "approve" | "reject";
  completionId: number;
  challengeTitle: string;
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

async function clearLastReviewActionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_REVIEW_ACTION_COOKIE);
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

  try {
    await client.query("BEGIN");

    const completionResult = await client.query<{
      userId: number;
      challengeId: number;
      challengeTitle: string;
    }>(
      `
        UPDATE public."ChallengeCompletion" AS cc
        SET
          "reviewStatus" = 'approved',
          "reviewedAt" = CURRENT_TIMESTAMP,
          "postedAt" = CURRENT_TIMESTAMP
        FROM public."Challenge" AS c
        WHERE
          cc.id = $1
          AND c.id = cc."challengeId"
          AND COALESCE(cc."reviewStatus"::text, 'pending') = 'pending'
        RETURNING cc."userId", cc."challengeId", c.title AS "challengeTitle"
      `,
      [completionId],
    );

    if (completionResult.rowCount === 0) {
      await client.query("ROLLBACK");
      revalidatePath("/");
      revalidatePath("/reviewing");
      return;
    }

    const approvedCompletion = completionResult.rows[0];

    await client.query(
      `
        UPDATE public."User" AS u
        SET "auraPoints" = u."auraPoints" + c."pointsReward"
        FROM public."Challenge" AS c
        WHERE u.id = $1
          AND c.id = $2
      `,
      [approvedCompletion.userId, approvedCompletion.challengeId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await setLastReviewActionCookie({
    action: "approve",
    completionId,
    challengeTitle: approvedCompletionTitle(formData),
  });

  revalidatePath("/");
  revalidatePath("/reviewing");
}

export async function rejectCompletion(formData: FormData) {
  await assertReviewSchema();

  const completionId = parseCompletionId(formData);
  const result = await db.query<{ challengeTitle: string }>(
    `
      UPDATE public."ChallengeCompletion" AS cc
      SET
        "reviewStatus" = 'rejected',
        "reviewedAt" = CURRENT_TIMESTAMP,
        "postedAt" = NULL
      FROM public."Challenge" AS c
      WHERE cc.id = $1
        AND c.id = cc."challengeId"
        AND COALESCE(cc."reviewStatus"::text, 'pending') = 'pending'
      RETURNING c.title AS "challengeTitle"
    `,
    [completionId],
  );

  if (result.rowCount) {
    await setLastReviewActionCookie({
      action: "reject",
      completionId,
      challengeTitle: result.rows[0].challengeTitle,
    });
  }

  revalidatePath("/");
  revalidatePath("/reviewing");
}

export async function undoReviewDecision(formData: FormData) {
  await assertReviewSchema();

  const completionId = parseCompletionId(formData);
  const action = parseUndoAction(formData);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    if (action === "approve") {
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

function approvedCompletionTitle(formData: FormData) {
  const rawChallengeTitle = formData.get("challengeTitle");
  return typeof rawChallengeTitle === "string" ? rawChallengeTitle : "Challenge";
}
