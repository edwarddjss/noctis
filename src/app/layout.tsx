import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/AppChrome";
import { TabBar } from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MatchNest", template: "%s · MatchNest" },
  description: "Follow soccer teams, players and leagues. Live scores, and authorized streams when available.",
  applicationName: "MatchNest",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MatchNest", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/icons/192", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AppChrome />
        <main id="main" className="main">
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  );
}
