import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  grantReviewAccess,
  isValidReviewAccessToken,
} from "@/lib/review-access";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token =
    payload && typeof payload === "object" && "token" in payload
      ? (payload as { token?: unknown }).token
      : null;

  if (typeof token !== "string" || !isValidReviewAccessToken(token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cookieStore = await cookies();
  grantReviewAccess(cookieStore);

  return NextResponse.json({ ok: true });
}
