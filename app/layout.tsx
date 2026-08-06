import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATLAS — the shape of cinema",
  description:
    "A map of cinematic lineage: what a film descends from, argues with and quietly rhymes with.",
  icons: {
    icon: "/atlas-icon.png",
    shortcut: "/atlas-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
