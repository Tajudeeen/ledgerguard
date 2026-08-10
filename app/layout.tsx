import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Splash } from "@/components/Splash";

export const metadata: Metadata = {
  title: "LedgerGuard — risk-ranked FXRP agent selection",
  description:
    "Ranks live FXRP minting agents on Flare Coston2 by projected collateral headroom, and anchors the ranking on-chain.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
