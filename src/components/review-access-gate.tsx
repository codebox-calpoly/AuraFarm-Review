"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { unlockReviewApp, type UnlockReviewAppState } from "@/app/actions";
import { REVIEW_ACCESS_LOCAL_STORAGE_KEY } from "@/lib/review-access-constants";

import styles from "./review-access-gate.module.css";

const INITIAL_STATE: UnlockReviewAppState = {
  error: null,
  success: false,
  accessToken: null,
};

export function ReviewAccessGate() {
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState(true);
  const [state, formAction, isPending] = useActionState(unlockReviewApp, INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function restoreAccess() {
      const storedToken = window.localStorage.getItem(REVIEW_ACCESS_LOCAL_STORAGE_KEY);

      if (!storedToken) {
        if (!cancelled) {
          setIsRestoring(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/review-access/restore", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ token: storedToken }),
        });

        if (!response.ok) {
          window.localStorage.removeItem(REVIEW_ACCESS_LOCAL_STORAGE_KEY);
          if (!cancelled) {
            setIsRestoring(false);
          }
          return;
        }

        router.refresh();
      } catch {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    }

    void restoreAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!state.success || !state.accessToken) {
      return;
    }

    window.localStorage.setItem(REVIEW_ACCESS_LOCAL_STORAGE_KEY, state.accessToken);
    router.refresh();
  }, [router, state.accessToken, state.success]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.panel}>
          <span className={styles.tag}>Protected review app</span>
          <h1>AuraFarm Review Access</h1>
          <p className={styles.copy}>
            This reviewer dashboard is locked. Enter the access password to continue.
          </p>

          {isRestoring ? (
            <div className={styles.restoreNotice}>Restoring saved access...</div>
          ) : (
            <form action={formAction} className={styles.form}>
              <label className={styles.field}>
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  name="password"
                  placeholder="Enter review password"
                  required
                  type="password"
                />
              </label>

              {state.error ? <p className={styles.errorBanner}>{state.error}</p> : null}

              <button className={styles.submitButton} disabled={isPending} type="submit">
                {isPending ? "Unlocking..." : "Unlock review app"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
