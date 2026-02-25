import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "LedVelvet (c)",
  description: "Demo navigabile: Cercle Moment mockup + Live Demo",
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <Script
          id="iubenda-widget"
          src="https://embeds.iubenda.com/widgets/bef73820-dd23-466b-afcc-d8dd85461a04.js"
          strategy="beforeInteractive"
        />

        {children}
        {modal}
      </body>
    </html>
  );
}