import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ShopTalk",
  description: "Chat with your manual.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
