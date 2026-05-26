"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { approveCompletion, rejectCompletion, skipReview } from "@/app/actions";
import type { PendingReview } from "@/lib/review-dashboard";

import styles from "./review-shell.module.css";

type ReviewShellProps = {
  review: PendingReview;
  variant?: "swipe";
};

type FlashDirection = "approve" | "reject" | null;

const SWIPE_THRESHOLD = 120;

export function ReviewShell({ review }: ReviewShellProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [flashDirection, setFlashDirection] = useState<FlashDirection>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDistance, setDragDistance] = useState(0);

  const approveFormRef = useRef<HTMLFormElement>(null);
  const rejectFormRef = useRef<HTMLFormElement>(null);
  const dragStateRef = useRef({ active: false, startX: 0, pointerId: -1 });
  const suppressClickRef = useRef(false);

  function triggerDecision(direction: Exclude<FlashDirection, null>) {
    setFlashDirection(direction);
    window.setTimeout(() => {
      setFlashDirection(null);
    }, 650);

    if (direction === "approve") {
      approveFormRef.current?.requestSubmit();
      return;
    }

    rejectFormRef.current?.requestSubmit();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (isModalOpen) {
      return;
    }

    suppressClickRef.current = false;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      pointerId: event.pointerId,
    };
    setIsDragging(true);
    setDragDistance(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (
      !dragStateRef.current.active ||
      dragStateRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    const nextDragX = event.clientX - dragStateRef.current.startX;
    setDragX(nextDragX);
    setDragDistance(Math.abs(nextDragX));
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLElement>) {
    if (
      !dragStateRef.current.active ||
      dragStateRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    const finalDragX = dragX;
    dragStateRef.current = { active: false, startX: 0, pointerId: -1 };
    setIsDragging(false);
    setDragX(0);
    setDragDistance(0);

    if (Math.abs(finalDragX) > 8) {
      suppressClickRef.current = true;
    }

    if (finalDragX >= SWIPE_THRESHOLD) {
      triggerDecision("approve");
      return;
    }

    if (finalDragX <= -SWIPE_THRESHOLD) {
      triggerDecision("reject");
    }
  }

  const swipeHint =
    dragX > 24
      ? "Swipe to accept"
      : dragX < -24
        ? "Swipe to decline"
        : "Swipe or use the buttons";
  const tintDirection =
    flashDirection ?? (dragX > 0 ? "approve" : dragX < 0 ? "reject" : null);
  const tintOpacity = flashDirection
    ? 0.7
    : Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1) * 0.7;
  const flagReasonPreview = review.flags.slice(0, 2);
  const isFlaggedReview = review.queueKind === "flagged";

  return (
    <>
      {tintDirection ? (
        <div
          className={`${styles.flashOverlay} ${
            tintDirection === "approve" ? styles.flashApprove : styles.flashReject
          }`}
          style={{ opacity: tintOpacity }}
        />
      ) : null}

      <div className={styles.shell}>
        <section className={styles.swipeStage}>
          <div className={styles.reviewLane}>
            <form ref={rejectFormRef} action={rejectCompletion} className={styles.sideActionForm}>
              <input name="completionId" type="hidden" value={review.completionId} />
              <input name="challengeTitle" type="hidden" value={review.challenge.title} />
              <button
                className={`${styles.actionButton} ${styles.declineButton}`}
                onClick={() => setFlashDirection("reject")}
                type="submit"
              >
                Decline
              </button>
            </form>

            <form action={skipReview} className={styles.skipForm}>
              <input name="completionId" type="hidden" value={review.completionId} />
              <button className={styles.skipButton} type="submit">
                Skip for now
              </button>
            </form>

          <article
            className={`${styles.swipeCard} ${isDragging ? styles.draggingCard : ""}`}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }

              if (!isDragging && dragDistance < 10) {
                setIsModalOpen(true);
              }
            }}
            onPointerCancel={handlePointerEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            style={{
              transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
            }}
          >
            <div className={styles.swipeBadgeRow}>
              <span className={styles.queueTag}>Review #{review.completionId}</span>
              <div className={styles.swipeBadgeCluster}>
                {review.flags.length ? (
                  <span
                    className={`${styles.statusBadge} ${
                      isFlaggedReview ? styles.flaggedBadge : styles.flaggedPendingBadge
                    }`}
                  >
                    {review.queueLabel}
                  </span>
                ) : null}
                <span className={styles.swipeBadge}>{swipeHint}</span>
              </div>
            </div>

            <div className={styles.cardMedia}>
              <SubmissionImage
                alt={`Completion submission for ${review.challenge.title}`}
                challengeTitle={review.challenge.title}
                sizes="(max-width: 1120px) 100vw, 56vw"
                src={review.imageUrl}
              />
              <div
                className={`${styles.directionStamp} ${
                  dragX > 40 ? styles.acceptStamp : dragX < -40 ? styles.declineStamp : ""
                }`}
              >
                {dragX > 40 ? "Accept" : dragX < -40 ? "Decline" : ""}
              </div>
            </div>

              <div className={styles.cardBody}>
                <div className={styles.cardHeader}>
                  <div>
                    <span
                      className={`${styles.pendingTag} ${
                        review.flags.length ? styles.flaggedTag : ""
                      }`}
                    >
                      {review.queueLabel}
                    </span>
                    <h3>{review.challenge.title}</h3>
                    <p className={styles.challengeSummary}>{review.challenge.description}</p>
                  </div>
                <div className={styles.likesPill}>{review.likes} likes</div>
              </div>

              {review.flags.length ? (
                <section className={styles.flagSummaryPanel}>
                  <div className={styles.flagSummaryHeader}>
                    <strong>{review.queueDescription}</strong>
                    <span>{review.flags.length} flags</span>
                  </div>
                  <ul className={styles.flagReasonPreviewList}>
                    {flagReasonPreview.map((flag) => (
                      <li key={flag.id}>
                        <span>{flag.flaggedBy}</span>
                        <p>{flag.reason || "No reason supplied."}</p>
                      </li>
                    ))}
                  </ul>
                  {review.flags.length > flagReasonPreview.length ? (
                    <p className={styles.flagSummaryFootnote}>
                      Open the full review to read all {review.flags.length} flag reasons.
                    </p>
                  ) : null}
                </section>
              ) : null}

              <p className={styles.cardCaption}>
                {review.caption || "No caption included with this submission."}
              </p>

              <div className={styles.cardStats}>
                <InfoTile label="Reward" value={`${review.challenge.pointsReward} aura`} />
                <InfoTile label="Difficulty" value={review.challenge.difficulty} />
                <InfoTile label="Submitter" value={review.user.name} />
                <InfoTile label="Flags" value={`${review.flags.length}`} />
                <InfoTile label="Uploader streak" value={`${review.user.streak} days`} />
                <InfoTile
                  label="Reviewer target"
                  value={review.flags.length ? review.queueLabel : "Clean"}
                />
                <InfoTile label="Distance" value={`${review.completionDistanceMiles.toFixed(2)} mi`} />
                <InfoTile label="Uploaded" value={review.completedAtShortLabel} />
                <InfoTile label="Aura after approve" value={`${review.user.auraPoints + review.challenge.pointsReward}`} />
              </div>

              <div className={styles.cardFooter}>
                <span>Tap the card for more details</span>
                <span>{dragX >= SWIPE_THRESHOLD
                  ? "Release to accept"
                  : dragX <= -SWIPE_THRESHOLD
                    ? "Release to decline"
                    : "Swipe left or right"}</span>
              </div>
            </div>
          </article>

            <form ref={approveFormRef} action={approveCompletion} className={styles.sideActionForm}>
              <input name="completionId" type="hidden" value={review.completionId} />
              <input name="challengeTitle" type="hidden" value={review.challenge.title} />
              <button
                className={`${styles.actionButton} ${styles.acceptButton}`}
                onClick={() => setFlashDirection("approve")}
                type="submit"
              >
                Accept
              </button>
            </form>
          </div>
        </section>
      </div>

      {isModalOpen ? (
        <div
          aria-modal="true"
          className={styles.modalBackdrop}
          onClick={() => setIsModalOpen(false)}
          role="dialog"
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.pendingTag}>Full review</span>
                <h2>{review.challenge.title}</h2>
              </div>
              <button
                aria-label="Close review details"
                className={styles.closeButton}
                onClick={() => setIsModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <section className={styles.modalMedia}>
                <SubmissionImage
                  alt={`Submitted proof for ${review.challenge.title}`}
                  challengeTitle={review.challenge.title}
                  sizes="(max-width: 1080px) 100vw, 45vw"
                  src={review.imageUrl}
                />
              </section>

              <section className={styles.modalDetails}>
                {review.flags.length ? (
                  <section className={styles.flagCallout}>
                    <div className={styles.flagCalloutHeader}>
                      <span className={styles.flagCalloutTag}>{review.queueLabel}</span>
                      <strong>{review.flags.length} reports</strong>
                    </div>
                    <p>{review.queueDescription}</p>
                  </section>
                ) : null}

                <DetailGroup
                  items={[
                    ["Challenge", review.challenge.title],
                    ["Description", review.challenge.description],
                    [
                      "Photo guidelines",
                      review.challenge.photoGuidelines || "No photo guidance was provided.",
                    ],
                    ["Reward", `${review.challenge.pointsReward} aura points`],
                    ["Difficulty", review.challenge.difficulty],
                  ]}
                  title="Challenge requirements"
                />

                <DetailGroup
                  items={[
                    ["Submitter", review.user.name],
                    ["Email", review.user.email],
                    ["Current aura", `${review.user.auraPoints}`],
                    ["Current streak", `${review.user.streak}`],
                    ["Caption", review.caption || "No caption provided."],
                    ["Submitted at", review.completedAtLabel],
                  ]}
                  title="Submission details"
                />

                <DetailGroup
                  items={[
                    [
                      "Challenge coordinates",
                      formatCoordinates(review.challenge.latitude, review.challenge.longitude),
                    ],
                    [
                      "Submission coordinates",
                      formatCoordinates(review.completionLatitude, review.completionLongitude),
                    ],
                    ["Distance from challenge", `${review.completionDistanceMiles.toFixed(2)} miles`],
                    ["Stored image URI", review.imageUri],
                  ]}
                  title="Location and assets"
                />

                <section className={styles.flagPanel}>
                  <div className={styles.flagHeader}>
                    <h3>Moderation flags</h3>
                    <span>{review.flags.length}</span>
                  </div>
                  {review.flags.length ? (
                    <ul className={styles.flagList}>
                      {review.flags.map((flag) => (
                        <li key={flag.id}>
                          <strong>{flag.flaggedBy}</strong>
                          <span>{flag.createdAtLabel}</span>
                          <p>{flag.reason || "No reason supplied."}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.flagEmpty}>
                      No one has flagged this completion yet.
                    </p>
                  )}
                </section>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoTile}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SubmissionImage({
  src,
  alt,
  sizes,
  challengeTitle,
}: {
  src: string;
  alt: string;
  sizes: string;
  challengeTitle: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className={styles.imageFallback}>
        <span className={styles.imageFallbackTag}>Image unavailable</span>
        <strong>{challengeTitle}</strong>
        <p>The stored submission image is empty or could not be loaded.</p>
      </div>
    );
  }

  return (
    <Image
      alt={alt}
      className={styles.submissionImage}
      fill
      onError={() => setFailed(true)}
      sizes={sizes}
      src={src}
      unoptimized
    />
  );
}

function DetailGroup({
  title,
  items,
}: {
  title: string;
  items: Array<[string, string]>;
}) {
  return (
    <section className={styles.detailGroup}>
      <h3>{title}</h3>
      <dl className={styles.detailList}>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
