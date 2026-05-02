import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ActiveOrganizerProvider } from "./components/ActiveOrganizerContext";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { BottomNavProvider } from "./components/BottomNavContext";
import { TileTransitionProvider } from "./components/TileTransitionProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Outsy — Montréal Events",
  description: "Discover music, nightlife, and art events in Montréal.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Shrink the layout viewport when the virtual keyboard opens so that
  // position:fixed elements (like the chat composer) automatically stay above it.
  // Supported: iOS 17+, Chrome 108+. Falls back gracefully on older versions.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AuthProvider>
          <ActiveOrganizerProvider>
            <BottomNavProvider>
              <TileTransitionProvider>
                <Header />
                {children}
                <BottomNav />
              </TileTransitionProvider>
            </BottomNavProvider>
          </ActiveOrganizerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
