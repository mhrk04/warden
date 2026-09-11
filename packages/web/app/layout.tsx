import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "WARDEN",
  description: "Human-verified autonomous agent with on-chain enforced permissions"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
