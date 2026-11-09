import { NEIGHBOURHOOD_COPY } from '@runrealm/shared-core/utils/atlas-voice';
import type { Metadata, Viewport } from 'next';
import '../styles/design-tokens.css';
import '../styles/loading-splash.css';
import '../styles/core-system.css';
import '../styles/components.css';
import '../styles/interfaces.css';
import '../styles/wallet-sheet.css';
import '../styles/external-fitness.css';
import '../styles/orbis-live.css';
import '../styles/responsive.css';
import '../styles/run-theater.css';
import '../styles/neighbourhood.css';
import '../styles/realm-screens.css';
import '../styles/neighbourhood-tour.css';
import '../styles/living-realm.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://runrealm.example.com'),
  title: {
    default: NEIGHBOURHOOD_COPY.product.title,
    template: '%s · RunRealm',
  },
  description: NEIGHBOURHOOD_COPY.product.description,
  applicationName: 'RunRealm',
  authors: [{ name: 'RunRealm' }],
  keywords: ['fitness', 'running', 'personal atlas', 'neighbourhood exploration'],
  category: 'fitness',
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RunRealm',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
    ],
    apple: [{ url: '/apple-touch-icon-180x180.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    title: NEIGHBOURHOOD_COPY.product.title,
    description: NEIGHBOURHOOD_COPY.product.description,
    siteName: 'RunRealm',
  },
  twitter: {
    card: 'summary_large_image',
    title: NEIGHBOURHOOD_COPY.product.title,
    description: NEIGHBOURHOOD_COPY.product.description,
  },
};

export const viewport: Viewport = {
  themeColor: '#0d2b3e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <div id="maplibre-container" role="application" aria-label="RunRealm map" />
      </body>
    </html>
  );
}
