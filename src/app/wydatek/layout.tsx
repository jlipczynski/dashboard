import type { Metadata, Viewport } from "next"

// Separate PWA manifest only for /wydatek (start_url=/wydatek), so the main
// Dashboard does not inherit the "Wydatek" icon. No service worker (MVP).
export const metadata: Metadata = {
  title: "Wydatek",
  manifest: "/wydatek.webmanifest",
  appleWebApp: { capable: true, title: "Wydatek", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/pwa/wydatek-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/wydatek-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa/wydatek-apple-180.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
  // Next 16 emits only "mobile-web-app-capable"; older iOS needs the apple- prefix for standalone mode.
  other: { "apple-mobile-web-app-capable": "yes" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAFAF9",
}

export default function WydatekLayout({ children }: { children: React.ReactNode }) {
  return children
}
