import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LedVelvet MVP (Local Demo)",
  description: "Demo navigabile: Cercle Moment mockup + Live Demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
