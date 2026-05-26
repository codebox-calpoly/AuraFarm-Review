import { cookies } from "next/headers";

import { undoReviewDecision } from "@/app/actions";
import { ReviewShell } from "@/components/review-shell";
import { REVIEW_MIGRATION_SQL } from "@/lib/review-migration";
import { getReviewDashboardData } from "@/lib/review-dashboard";

import styles from "./reviewing.module.css";

export const dynamic = "force-dynamic";

type LastReviewAction = {
  action: "approve" | "reject";
  completionId: number;
  challengeTitle: string;
};

export default async function ReviewingPage() {
  let dashboard: Awaited<ReturnType<typeof getReviewDashboardData>> | null = null;
  let connectionMessage: string | null = null;
  const lastAction = await getLastReviewAction();
  const skippedReviewIds = await getSkippedReviewIds();

  try {
    dashboard = await getReviewDashboardData({ skippedCompletionIds: skippedReviewIds });
  } catch (error) {
    connectionMessage =
      error instanceof Error ? error.message : "Unknown database connection error.";
  }

  if (connectionMessage) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.banner}>
            <span className={styles.bannerTag}>Connection blocked</span>
            <h1>Reviewing is temporarily unavailable.</h1>
            <p>{connectionMessage}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!dashboard) {
    throw new Error("Dashboard data was not loaded.");
  }

  if (!dashboard.schemaReady) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.banner}>
            <span className={styles.bannerTag}>Migration required</span>
            <h1>The review queue needs its moderation columns before it can open.</h1>
            <p>Run the SQL below and reload this route.</p>
          </section>
          <section className={styles.sqlPanel}>
            <h2>SQL to run</h2>
            <pre>{REVIEW_MIGRATION_SQL}</pre>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.banner}>
          <span className={styles.bannerTag}>Swipe queue</span>
          <h1>Swipe right to accept. Swipe left to decline.</h1>
          <p>
            Drag the card or use the side buttons. Flagged submissions are labeled
            directly on the card and include the reporting reasons.
          </p>
        </section>

        {lastAction ? (
          <section className={styles.undoPanel}>
            <div>
              <span className={styles.undoTag}>Last action</span>
              <p className={styles.undoText}>
                {lastAction.action === "approve" ? "Accepted" : "Declined"}{" "}
                <strong>{lastAction.challengeTitle}</strong>.
              </p>
            </div>

            <form action={undoReviewDecision}>
              <input name="completionId" type="hidden" value={lastAction.completionId} />
              <input name="action" type="hidden" value={lastAction.action} />
              <button className={styles.undoButton} type="submit">
                Undo
              </button>
            </form>
          </section>
        ) : null}

        {dashboard.nextReview ? (
          <ReviewShell review={dashboard.nextReview} variant="swipe" />
        ) : (
          <section className={styles.emptyState}>
            <span className={styles.emptyTag}>Queue clear</span>
            <h2>No pending submissions to review.</h2>
            <p>Come back here when a new challenge completion is waiting.</p>
          </section>
        )}
      </main>
    </div>
  );
}

async function getLastReviewAction(): Promise<LastReviewAction | null> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("auraFarmLastReviewAction")?.value;

  if (!rawCookie) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawCookie) as LastReviewAction;

    if (
      (parsed.action === "approve" || parsed.action === "reject") &&
      Number.isInteger(parsed.completionId) &&
      typeof parsed.challengeTitle === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

async function getSkippedReviewIds(): Promise<number[]> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("auraFarmSkippedReviewIds")?.value;

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
