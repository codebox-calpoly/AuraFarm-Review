import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export { REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_LOCAL_STORAGE_KEY } from "./review-access-constants";
import { REVIEW_ACCESS_COOKIE } from "./review-access-constants";

const REVIEW_ACCESS_COOKIE_VALUE = "granted";
const REVIEW_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type ReadableCookieStore = {
  get(name: string): { value: string } | undefined;
};

type WritableCookieStore = {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      path: string;
      sameSite: "lax";
      maxAge: number;
    },
  ): void;
};

export function getReviewPassword() {
  const password = process.env.REVIEWING_PASSWORD;

  if (!password) {
    throw new Error("REVIEWING_PASSWORD is not configured.");
  }

  return password;
}

export function createReviewAccessToken() {
  return createHash("sha256")
    .update(`aurafarm-review:${getReviewPassword()}`)
    .digest("hex");
}

export function isValidReviewPassword(password: string) {
  const expectedPassword = Buffer.from(getReviewPassword());
  const candidatePassword = Buffer.from(password);

  if (expectedPassword.length !== candidatePassword.length) {
    return false;
  }

  return timingSafeEqual(expectedPassword, candidatePassword);
}

export function isValidReviewAccessToken(token: string) {
  const expectedToken = Buffer.from(createReviewAccessToken());
  const candidateToken = Buffer.from(token);

  if (expectedToken.length !== candidateToken.length) {
    return false;
  }

  return timingSafeEqual(expectedToken, candidateToken);
}

export function hasReviewAccess(cookieStore: ReadableCookieStore) {
  return cookieStore.get(REVIEW_ACCESS_COOKIE)?.value === REVIEW_ACCESS_COOKIE_VALUE;
}

export function grantReviewAccess(cookieStore: WritableCookieStore) {
  cookieStore.set(REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_COOKIE_VALUE, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: REVIEW_ACCESS_COOKIE_MAX_AGE,
  });
}
