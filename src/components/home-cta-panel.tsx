"use client";

import Link from "next/link";

import styles from "./home-cta-panel.module.css";

type HomeCtaPanelProps = {
  reviewHref: string;
  addChallengeHref: string;
};

export function HomeCtaPanel({ reviewHref, addChallengeHref }: HomeCtaPanelProps) {
  return (
    <div className={styles.ctaGrid}>
      <Link className={styles.startButton} href={reviewHref}>
        Start reviewing
      </Link>
      <Link className={styles.plusButton} href={addChallengeHref}>
        <span aria-hidden="true">+</span>
        <strong>Add challenge</strong>
      </Link>
    </div>
  );
}
