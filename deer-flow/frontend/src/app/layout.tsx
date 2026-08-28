import "@/styles/globals.css";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/sora/wght.css";
import "katex/dist/katex.min.css";

import { type Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/core/brand";
import { I18nProvider } from "@/core/i18n/context";
import { detectLocaleServer } from "@/core/i18n/server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-mi-sans-next",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-mi-serif-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_DESCRIPTION,
  icons: {
    icon: "/images/metainsight-mark.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await detectLocaleServer();
  return (
    <html lang={locale} suppressContentEditableWarning suppressHydrationWarning>
      <body
        className={`font-[family-name:var(--font-mi-sans)] antialiased ${inter.variable} ${newsreader.variable}`}
      >
        <ThemeProvider attribute="class" enableSystem disableTransitionOnChange>
          <I18nProvider initialLocale={locale}>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
