import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Outfit } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/providers/theme-provider";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Hi-Boss | Agent Operations Console",
  description:
    "Web dashboard for Hi-Boss — manage agents, teams, and durable messaging.",
};

// Inline script that runs before first paint to set the correct theme class,
// preventing the dark→light (or light→dark) flash on page load.
const themeInitScript = `(function(){try{var t=localStorage.getItem("hiboss-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme:light)").matches?"light":"dark"}document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
