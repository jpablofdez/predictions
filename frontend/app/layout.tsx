import type { Metadata } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "prediction.csv",
  description: "MVP de prediccion para Nuevos Tiempos Reventados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${outfit.variable} ${spaceGrotesk.variable} antialiased`}>{children}</body>
    </html>
  );
}
