import type { Metadata, Viewport } from "next";
import { Quicksand, Nunito, Pacifico } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WhatsAppButton from "@/components/ui/WhatsAppButton";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-quicksand",
  weight: ["500", "600", "700"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600"],
});

const pacifico = Pacifico({
  subsets: ["latin"],
  variable: "--font-pacifico",
  weight: "400",
});

export const viewport: Viewport = {
  themeColor: "#580459",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "PlayTime - Creando Momentos",
    template: "%s | PlayTime Panam\u00e1",
  },
  description: "Fiestas infantiles en Panam\u00e1. Animaci\u00f3n, alquiler de equipos y manualidades para cumplea\u00f1os y eventos. \u00a1Todo hasta tu puerta!",
  openGraph: {
    images: ["/images/logo.png"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PlayTime",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body
        className={`${quicksand.variable} ${nunito.variable} ${pacifico.variable} font-body antialiased`}
      >
        <CartProvider>
          <Navbar />
          <main className="min-h-screen">{children}</main>
          <Footer />
          <WhatsAppButton />
        </CartProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
