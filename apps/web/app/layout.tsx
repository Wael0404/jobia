import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ScrollReveal } from "../components/ScrollReveal";
import { Providers } from "../lib/providers";
import "./globals.css";

// Self-hosted at build time by next/font: no runtime request to Google, no layout shift.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Jobia — votre agent de candidature",
  description: "Déposez votre CV, Jobia postule pour vous et suit chaque candidature.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#090b14" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={sans.variable} suppressHydrationWarning>
      <head>
        {/* Enables JS-only effects (scroll reveal) before first paint, so nothing flashes. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <Providers>{children}</Providers>
        <ScrollReveal />
      </body>
    </html>
  );
}
