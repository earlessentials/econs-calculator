import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Econome by Pearling — Economics & Neuroeconomics Calculator",
  description:
    "Calculate essential economics, neuroeconomics, and behavioral decision science formulas across value, risk, learning, choice, finance, trade, and public economics.",
  openGraph: {
    title: "Econome by Pearling — Economics & Neuroeconomics, Made Calculable",
    description:
      "143 interactive calculators for economics, behavioral decision science, and neuroeconomics.",
    type: "website",
    images: [
      {
        url: "https://earlessentials.github.io/econs-calculator/og.jpg",
        width: 1731,
        height: 909,
        alt: "Econome by Pearling — economics and neuroeconomics, made calculable",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Econome by Pearling — Economics & Neuroeconomics, Made Calculable",
    description:
      "143 interactive calculators for economics, behavioral decision science, and neuroeconomics.",
    images: ["https://earlessentials.github.io/econs-calculator/og.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
