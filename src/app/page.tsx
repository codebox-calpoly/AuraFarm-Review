import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>AuraFarm Review</span>
          <h1>Next.js is set up and ready for your review workflow.</h1>
          <p>
            Start building in <code>src/app/page.tsx</code> and expand from the
            App Router structure already in place.
          </p>
        </div>
        <div className={styles.ctas}>
          <a className={styles.primary} href="https://nextjs.org/docs">
            Read Next.js docs
          </a>
          <a
            className={styles.secondary}
            href="https://react.dev/learn"
          >
            React guide
          </a>
        </div>
      </main>
    </div>
  );
}
