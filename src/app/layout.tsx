import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Энергомонтёр · Гомель — мониторинг потребления ПК и ноутбука в реальном времени",
  description:
    "Живой мониторинг энергопотребления вашего компьютера и ноутбука с расчётом стоимости по действующим тарифам Республики Беларусь (Гомель, постановление Совмина от 25.02.2026 № 93).",
  keywords: [
    "энергопотребление",
    "мониторинг",
    "тарифы на электроэнергию",
    "Гомель",
    "Беларусь",
    "кВт·ч",
    "BYN",
  ],
};

export const viewport: Viewport = {
  themeColor: "#06080a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-ink-950 text-chalk antialiased">
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute inset-0 bg-grid opacity-70" />
          <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(201,242,74,0.12),transparent_65%)]" />
          <div className="absolute top-[38%] -right-40 h-[420px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(76,198,232,0.09),transparent_68%)]" />
          <div className="absolute inset-0 bg-scanline opacity-40" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
