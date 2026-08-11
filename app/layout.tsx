import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Splash } from "@/components/Splash";

const SITE_URL = "https://ledgerguard.app";
const TITLE = "LedgerGuard — risk-ranked FXRP agent selection";
const DESCRIPTION =
  "Ranks live FXRP minting agents on Flare Coston2 by projected collateral headroom, shows how far XRP can fall before each agent liquidates, and anchors the ranking on-chain so anyone can verify it later.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "LedgerGuard",
  keywords: ["Flare", "Coston2", "FAssets", "FXRP", "liquidation", "risk", "agent selection"],
  authors: [{ name: "LedgerGuard" }],
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  themeColor: "#08090b",
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="overflow-x-hidden">
        <Splash />
        {children}
      </body>
    </html>
  );
}
