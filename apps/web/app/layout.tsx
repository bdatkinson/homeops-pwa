import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HomeOps",
  description: "Before you call. Before you pay. Before you make it worse.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body
        style={{
          backgroundColor: "#1a1a1a",
          color: "#ffffff",
          fontFamily: "var(--font-mono), 'IBM Plex Mono', monospace",
          margin: 0,
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
