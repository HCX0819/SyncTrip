import type { Metadata, Viewport } from "next";
import { Playfair_Display } from "next/font/google";
import OfflineBanner from "@/components/layout/OfflineBanner";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "SyncTrip — Plan Together. Travel Better.",
  description:
    "Group travel planning made effortless. Save places, vote on favorites, and build your itinerary together.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SyncTrip",
  },
  openGraph: {
    title: "SyncTrip",
    description: "Group travel planning, beautifully.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fffaf3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`grain theme-noir ${playfairDisplay.variable}`}>
      <body className="min-h-dvh">
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
