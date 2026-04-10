import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { CartProvider } from "@/context/CartContext";
import { ToastProvider } from "@/context/ToastContext";
import { LogoProvider } from "@/context/LogoContext";
import { fetchLogoUrl } from "@/lib/supabase-data";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import WhatsAppButton from "@/components/ui/WhatsAppButton";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const chalet = localFont({
  src: "./fonts/Chalet-LondonNineteenEighty.otf",
  variable: "--font-chalet",
});


export const viewport: Viewport = {
  themeColor: "#FAF3E8",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://playtime-kids.vercel.app'),
  title: {
    default: "PlayTime - Creando Momentos",
    template: "%s | PlayTime Panam\u00e1",
  },
  description: "Fiestas infantiles en Panam\u00e1. Animaci\u00f3n, alquiler de equipos y manualidades para cumplea\u00f1os y eventos. \u00a1Todo hasta tu puerta!",
  openGraph: {
    title: "PlayTime - Creando Momentos",
    description: "Fiestas infantiles en Panamá. Animación, alquiler de equipos y manualidades para cumpleaños y eventos. ¡Todo hasta tu puerta!",
    url: "https://playtime-kids.vercel.app",
    siteName: "PlayTime Panamá",
    locale: "es_PA",
    type: "website",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayTime - Creando Momentos",
    description: "Fiestas infantiles en Panamá. Animación, alquiler de equipos y manualidades para cumpleaños y eventos.",
    images: ["/logo.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PlayTime",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let logoUrl: string | null = null;
  try {
    logoUrl = await fetchLogoUrl();
  } catch (e) {
    console.error('Error loading logo:', e);
  }

  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["Organization", "LocalBusiness"],
              name: "PlayTime Panamá",
              description:
                "Fiestas infantiles en Panamá. Animación, alquiler de equipos, manualidades y shows para cumpleaños y eventos infantiles. ¡Todo hasta tu puerta!",
              url: "https://playtimepanama.com",
              telephone: "(+507) 6433-2724",
              email: "playtimekidspty@gmail.com",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Ciudad de Panamá",
                addressCountry: "PA",
              },
              priceRange: "$$",
              sameAs: ["https://www.instagram.com/playtimekids"],
              serviceType: "Fiestas Infantiles",
              areaServed: {
                "@type": "City",
                name: "Ciudad de Panamá",
              },
            }),
          }}
        />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}</Script>
          </>
        )}
      </head>
      <body
        className={`${chalet.variable} font-body antialiased`}
      >
        <ToastProvider>
          <CartProvider>
            <LogoProvider initialLogoUrl={logoUrl}>
              <Navbar />
              <main className="min-h-screen">{children}</main>
              <Footer />
            </LogoProvider>
            <WhatsAppButton />
          </CartProvider>
        </ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
