import { HomeCtaPanel } from "@/components/home-cta-panel";
import { REVIEW_MIGRATION_SQL } from "@/lib/review-migration";
import { getReviewDashboardData } from "@/lib/review-dashboard";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dashboard: Awaited<ReturnType<typeof getReviewDashboardData>> | null = null;
  let connectionMessage: string | null = null;

  try {
    dashboard = await getReviewDashboardData();
  } catch (error) {
    connectionMessage =
      error instanceof Error ? error.message : "Unknown database connection error.";
  }

  if (connectionMessage) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>AuraFarm Review Dashboard</span>
              <h1>The landing page cannot open a database session right now.</h1>
              <p>
                The review app is online, but the current database connection is not
                available for request-time reads.
              </p>
            </div>

            <div className={styles.connectionNotice}>
              <span className={styles.connectionTag}>Connection blocked</span>
              <p>{connectionMessage}</p>
            </div>
          </section>

          <section className={styles.infoPanel}>
            <span className={styles.infoTag}>What to fix</span>
            <h2>Use a stable direct database connection for the reviewer app.</h2>
            <p>
              If another local process or app is holding the current database
              connection open, the landing page cannot load the review queue stats.
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (!dashboard) {
    throw new Error("Dashboard data was not loaded.");
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>AuraFarm Review Dashboard</span>
            <h1>Review completions before they hit the pending, approved, and live feed states.</h1>
            <p>
              This reviewer app is the manual moderation gate for AuraFarm. Approvals
              award aura points and mark submissions as posted. Rejections remove them
              from the queue and send them back for follow-up. Approved submissions with
              fresh user flags also return here for re-review.
            </p>
          </div>

          {dashboard.schemaReady ? (
            <div className={styles.statsGrid}>
              <StatCard
                description="Completions still waiting for a reviewer decision."
                label="Pending"
                value={dashboard.stats.pending}
              />
              <StatCard
                description="Completions already approved and posted."
                label="Approved"
                value={dashboard.stats.approved}
              />
              <StatCard
                description="Completions already declined and returned."
                label="Rejected"
                value={dashboard.stats.rejected}
              />
              <StatCard
                description="Already-approved completions that were flagged and need another look."
                label="Flagged live"
                value={dashboard.stats.flaggedApproved}
              />
            </div>
          ) : (
            <div className={styles.migrationNotice}>
              <span className={styles.migrationTag}>Migration required</span>
              <p>
                The live database is missing the review fields this dashboard needs.
                Run the SQL below before opening the reviewer flow.
              </p>
            </div>
          )}
        </section>

        {dashboard.schemaReady ? (
          <section className={styles.startPanel}>
            <div className={styles.ctaWrap}>
              <HomeCtaPanel addChallengeHref="/add-challenge" reviewHref="/reviewing" />
            </div>
          </section>
        ) : (
          <section className={styles.sqlPanel}>
            <h2>SQL to run</h2>
            <pre>{REVIEW_MIGRATION_SQL}</pre>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <article className={styles.statCard}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{description}</p>
    </article>
  );
}
