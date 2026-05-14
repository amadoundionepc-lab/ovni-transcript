import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OVNI Transcript",
  description: "Transcribe your TikTok, YouTube, Instagram and Facebook videos with Whisper AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
