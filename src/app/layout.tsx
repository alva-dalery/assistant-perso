import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assistant perso",
  description: "Assistant de vie personnelle unifié, adapté TDAH & TAG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#F8F9FD] text-slate-800 antialiased selection:bg-sky-500/20 selection:text-sky-800"
      >
        {children}
      </body>
    </html>
  );
}
