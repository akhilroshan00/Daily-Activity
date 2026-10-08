import type { Metadata } from "next";
import "./globals.css";
import "./studio.css";
import "./colours.css";
import { COLOUR_INIT_SCRIPT } from "@/lib/ui-preferences";

export const metadata: Metadata = {
  title: "Daylight — Daily Activity",
  description:
    "Make time for learning. A thoughtful calendar for your daily progress, with monthly reports and exports.",
};
const themeScript = `(function(){try{var t=localStorage.getItem('daylight.theme');document.documentElement.dataset.theme=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: COLOUR_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
