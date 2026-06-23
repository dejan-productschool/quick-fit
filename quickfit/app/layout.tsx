import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuickFit",
  description: "Tell us your time, energy, and equipment — get a workout you can start right now.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
