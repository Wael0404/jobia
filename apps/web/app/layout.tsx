import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jobia — votre agent de candidature",
  description: "Déposez votre CV, Jobia postule pour vous et suit chaque candidature.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
