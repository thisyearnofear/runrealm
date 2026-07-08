import type { Metadata, Viewport } from 'next';
import '../styles/design-tokens.css';
import '../styles/core-system.css';
import '../styles/components.css';
import '../styles/interfaces.css';
import '../styles/wallet-sheet.css';
import '../styles/external-fitness.css';
import '../styles/responsive.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://runrealm.example.com'),
  title: {
    default: 'RunRealm — Confidential Territory Defense on Zama FHE',
    template: '%s · RunRealm',
  },
  description:
    'RunRealm turns real-world runs into NFT territories you claim, boost, and defend. Territory defense scores are kept private with Zama FHE (fully homomorphic encryption) on Ethereum Sepolia — boost and contest rivals without revealing your score.',
  applicationName: 'RunRealm',
  authors: [{ name: 'RunRealm' }],
  keywords: [
    'GameFi',
    'fitness',
    'running',
    'NFT territories',
    'Zama',
    'FHE',
    'fully homomorphic encryption',
    'ZetaChain',
    'confidential defense',
    'web3',
  ],
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
    title: 'RunRealm — Confidential Territory Defense on Zama FHE',
    description:
      'Claim, boost, and defend real-world running territories. Defense scores stay private with Zama FHE — boost and contest rivals without revealing your score.',
    siteName: 'RunRealm',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RunRealm — Confidential Territory Defense on Zama FHE',
    description:
      'Claim, boost, and defend real-world running territories with Zama FHE private defense scores.',
  },
};

export const viewport: Viewport = {
  themeColor: '#00ff88',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
