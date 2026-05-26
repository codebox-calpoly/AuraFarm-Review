"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  createChallenge,
  createChallengesBulk,
  type BulkCreateChallengeFormState,
  type CreateChallengeFormState,
} from "@/app/actions";

import styles from "./challenge-builder.module.css";

const TAG_OPTIONS = [
  "sports",
  "outdoors",
  "clubs",
  "campus",
  "beach",
  "volunteering",
  "arts_culture",
  "misc",
] as const;

const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"] as const;

const INITIAL_STATE: CreateChallengeFormState = {
  error: null,
  fieldErrors: {},
  successMessage: null,
};

const INITIAL_BULK_STATE: BulkCreateChallengeFormState = {
  error: null,
  successMessage: null,
};

export function ChallengeBuilder() {
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [state, formAction, isPending] = useActionState(createChallenge, INITIAL_STATE);
  const [bulkState, bulkFormAction, isBulkPending] = useActionState(
    createChallengesBulk,
    INITIAL_BULK_STATE,
  );

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((currentTag) => currentTag !== tag)
        : [...current, tag],
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.headerTag}>Challenge builder</span>
          <h1>Add a challenge to AuraFarm</h1>
          <p className={styles.headerText}>
            Build a single challenge here, or switch to bulk mode when you already
            have a batch ready to import.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.bulkButton}
            onClick={() => setIsBulkModalOpen(true)}
            type="button"
          >
            Add multiple
          </button>
          <Link className={styles.backLink} href="/">
            Back to dashboard
          </Link>
        </div>
      </div>

      <form action={formAction} className={styles.form}>
        {selectedTags.map((tag) => (
          <input key={tag} name="tags" type="hidden" value={tag} />
        ))}

        <section className={styles.formBlock}>
          <div className={styles.blockHeader}>
            <h2>Challenge setup</h2>
            <p>Start with the headline, reward, and difficulty.</p>
          </div>

          <label className={styles.field}>
            <span>Title</span>
            <input name="title" placeholder="Sunset walk by Dexter Lawn" required type="text" />
            {state.fieldErrors.title ? <em>{state.fieldErrors.title}</em> : null}
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Difficulty</span>
              <select defaultValue="medium" name="difficulty" required>
                {DIFFICULTY_OPTIONS.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
              {state.fieldErrors.difficulty ? <em>{state.fieldErrors.difficulty}</em> : null}
            </label>

            <label className={styles.field}>
              <span>Points reward</span>
              <input min="1" name="pointsReward" placeholder="25" required type="number" />
              {state.fieldErrors.pointsReward ? <em>{state.fieldErrors.pointsReward}</em> : null}
            </label>
          </div>
        </section>

        <section className={styles.formBlock}>
          <div className={styles.blockHeader}>
            <h2>Challenge copy</h2>
            <p>Define what people need to do and what the photo should prove.</p>
          </div>

          <label className={styles.field}>
            <span>Description</span>
            <textarea
              name="description"
              placeholder={`Write each requirement on its own line.
Every newline becomes a new bullet point or guideline.`}
              required
              rows={5}
            />
            <p className={styles.helpText}>
              Every newline becomes a new bullet point or guideline in the challenge description.
            </p>
            {state.fieldErrors.description ? <em>{state.fieldErrors.description}</em> : null}
          </label>

          <label className={styles.field}>
            <span>Photo guidelines</span>
            <textarea
              name="photoGuidelines"
              placeholder={`Write each photo rule on its own line.
Every newline becomes a new guideline.`}
              rows={4}
            />
            <p className={styles.helpText}>
              Every newline becomes a separate photo guideline.
            </p>
            {state.fieldErrors.photoGuidelines ? <em>{state.fieldErrors.photoGuidelines}</em> : null}
          </label>
        </section>

        <section className={styles.formBlock}>
          <div className={styles.blockHeader}>
            <h2>Classification</h2>
            <p>Choose the tags that control where this challenge shows up.</p>
          </div>

          <div className={styles.field}>
            <span>Tags</span>
            <div className={styles.tagPicker}>
              <button
                aria-expanded={isTagPickerOpen}
                className={styles.tagPickerButton}
                onClick={() => setIsTagPickerOpen((current) => !current)}
                type="button"
              >
                {selectedTags.length
                  ? `${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"} selected`
                  : "Select one or more tags"}
              </button>

              {isTagPickerOpen ? (
                <div className={styles.tagMenu}>
                  {TAG_OPTIONS.map((tag) => (
                    <label className={styles.tagOption} key={tag}>
                      <input
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                        type="checkbox"
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <p className={styles.helpText}>
              Available options match the existing `Challenge.tags` enum values.
            </p>
            {state.fieldErrors.tags ? <em>{state.fieldErrors.tags}</em> : null}
          </div>
        </section>

        {state.error ? <p className={styles.errorBanner}>{state.error}</p> : null}
        {state.successMessage ? <p className={styles.successBanner}>{state.successMessage}</p> : null}

        <div className={styles.formActions}>
          <Link className={styles.secondaryButton} href="/">
            Cancel
          </Link>
          <button className={styles.primaryButton} disabled={isPending} type="submit">
            {isPending ? "Adding..." : "Add challenge"}
          </button>
        </div>
      </form>

      {isBulkModalOpen ? (
        <div
          aria-modal="true"
          className={styles.modalBackdrop}
          onClick={() => setIsBulkModalOpen(false)}
          role="dialog"
        >
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderCopy}>
                <span className={styles.modalTag}>Bulk challenge builder</span>
                <h2>Add multiple challenges</h2>
                <p>
                  Paste a JSON array. Each item must include `title`, `description`,
                  `difficulty`, `pointsReward`, and `tags`. `photoGuidelines` is optional.
                  Use `\n` inside `description` or `photoGuidelines` whenever you want a new
                  bullet point or guideline.
                </p>
              </div>
              <button
                aria-label="Close bulk add modal"
                className={styles.closeButton}
                onClick={() => setIsBulkModalOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <form action={bulkFormAction} className={styles.form}>
              <section className={styles.bulkInfoStrip}>
                <div>
                  <strong>Required keys</strong>
                  <span>`title`, `description`, `difficulty`, `pointsReward`, `tags`</span>
                </div>
                <div>
                  <strong>Optional</strong>
                  <span>`photoGuidelines`</span>
                </div>
                <div>
                  <strong>Formatting</strong>
                  <span>Use `\n` for new bullets or guidelines</span>
                </div>
              </section>

              <label className={styles.field}>
                <span>Bulk JSON payload</span>
                <textarea
                  className={styles.bulkTextarea}
                  name="payload"
                  placeholder={`[
  {
    "title": "Farmstand photo walk",
    "description": "Visit the campus farmstand and snap a clear photo.",
    "difficulty": "easy",
    "pointsReward": 20,
    "photoGuidelines": "Show the stand and one featured item.",
    "tags": ["campus", "misc"]
  },
  {
    "title": "Sunset field workout",
    "description": "Complete a short workout beside the rec field at sunset.",
    "difficulty": "medium",
    "pointsReward": 35,
    "tags": ["sports", "outdoors"]
  }
]`}
                  rows={16}
                />
              </label>

              <p className={styles.helpText}>
                Coordinates and ids are still automatic. Difficulty must be `easy`, `medium`, or `hard`.
                In bulk JSON, every `\n` inside `description` or `photoGuidelines` becomes a new bullet
                point or guideline.
              </p>

              {bulkState.error ? <p className={styles.errorBanner}>{bulkState.error}</p> : null}
              {bulkState.successMessage ? (
                <p className={styles.successBanner}>{bulkState.successMessage}</p>
              ) : null}

              <div className={styles.formActions}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setIsBulkModalOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button className={styles.primaryButton} disabled={isBulkPending} type="submit">
                  {isBulkPending ? "Adding..." : "Add challenges"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
