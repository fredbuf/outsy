import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outsy — Montréal Events",
  description: "Discover music, nightlife, and art events in Montréal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
