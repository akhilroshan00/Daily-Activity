import type { Metadata } from "next";
import "./globals.css";
import "./studio.css";
import "./colours.css";
import "./auth.css";
import "./brand.css";
import "./workspace.css";
import "./black.css";
import { COLOUR_INIT_SCRIPT, THEME_INIT_SCRIPT } from "@/lib/ui-preferences";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/daylight-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/daylight-apple.png", sizes: "180x180" }],
  },
  title: "Daylight — Daily Activity",
  description:
    "Make time for learning. A thoughtful calendar for your daily progress, with monthly reports and exports.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: COLOUR_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
