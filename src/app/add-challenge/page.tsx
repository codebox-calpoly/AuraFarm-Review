import { ChallengeBuilder } from "@/components/challenge-builder";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default function AddChallengePage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <ChallengeBuilder />
      </main>
    </div>
  );
}
