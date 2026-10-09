import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solana Wallet Scanner",
  description: "Filter a Solana wallet's SOL, USDC and memecoin transfers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
