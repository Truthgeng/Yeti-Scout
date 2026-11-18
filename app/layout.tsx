import type { Metadata, Viewport } from "next";
import "@fontsource/gluten/600.css";
import "@fontsource/gluten/700.css";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yeti Scout · the sniff test for Sui tokens",
  description: "Paste a Sui coin type or X handle. See if the traction is real or farmed.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1a1a2e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
