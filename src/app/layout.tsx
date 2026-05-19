import { AnimatedBackground } from "@/components/animated-background/animated-background";
import { ClientLayout } from "@/components/ClientLayout";
import "flag-icons/css/flag-icons.min.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Aleph Creative Audio",
  description: "Part of Aleph Creative Cloud Services",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="icon" href="/favicon.png" sizes="any" />
      </head>
      <body className="font-sans antialiased">
        <ClientLayout>
          {children}
          <AnimatedBackground />
        </ClientLayout>
      </body>
    </html>
  );
}
