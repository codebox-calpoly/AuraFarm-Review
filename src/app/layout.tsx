import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuraFarm Review",
  description: "Internal review dashboard for AuraFarm challenge approvals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
