import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Splash } from "@/components/Splash";
import { Analytics } from "@vercel/analytics/next";

// Canonical live URL - the Vercel deployment a judge opens. Every sharable
// link, OG tag and canonical reference must point here and nowhere else.
const SITE_URL = "https://ledgerguard-app.vercel.app";
const TITLE = "LedgerGuard - FXRP collateral risk on Flare Coston2";
const DESCRIPTION =
  "Reads live FXRP agent collateral on Flare Coston2, ranks agents by how deep a crash they survive and whether they can cover a redemption, and anchors the view on-chain so anyone can verify it later.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "LedgerGuard",
  keywords: ["Flare", "Coston2", "FAssets", "FXRP", "liquidation", "risk", "collateral", "redemption"],
  authors: [{ name: "LedgerGuard" }],
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "LedgerGuard",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="overflow-x-hidden">
        <Splash />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
