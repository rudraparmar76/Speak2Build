import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Speak2Build — Voice-First AI Pair Programmer for VS Code",
  description:
    "The voice-first AI pair programmer that fits in your editor. Real-time Silero VAD, autonomous workspace context crawling, inline unified diffs, and self-healing test repair.",
  keywords: [
    "Speak2Build",
    "voice coding",
    "AI pair programmer",
    "VS Code extension",
    "hands-free coding",
    "Silero VAD",
    "autonomous context",
    "pytest auto repair",
  ],
  authors: [{ name: "Speak2Build Team" }],
  icons: {
    icon: "/logo.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans bg-alma-yogurt text-alma-teriyaki antialiased selection:bg-alma-kiwi/30 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
