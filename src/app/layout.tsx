import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Newsreader } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: { default: "Jo-Lin Family Clinic & Surgery", template: "%s | Jo-Lin Clinic" },
  description: "Join the clinic queue remotely, book appointments, and arrive closer to your turn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${atkinson.variable} ${newsreader.variable} antialiased`}>
        <a href="#main" className="skip-link">Skip to main content</a>
        <SiteHeader />
        <main id="main">{children}</main>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
