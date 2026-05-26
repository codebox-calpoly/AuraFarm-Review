import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ReviewAccessGate } from "@/components/review-access-gate";
import { hasReviewAccess } from "@/lib/review-access";

import "./globals.css";

export const metadata: Metadata = {
  title: "AuraFarm Review",
  description: "Internal review dashboard for AuraFarm challenge approvals",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isUnlocked = hasReviewAccess(cookieStore);

  return (
    <html lang="en">
      <body>{isUnlocked ? children : <ReviewAccessGate />}</body>
    </html>
  );
}
