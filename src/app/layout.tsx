import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuraFarm Review",
  description: "Next.js starter project for AuraFarm Review",
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
