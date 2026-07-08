import type { Metadata, Viewport } from 'next';
import '../styles/design-tokens.css';
import '../styles/core-system.css';
import '../styles/components.css';
import '../styles/interfaces.css';
import '../styles/wallet-sheet.css';
import '../styles/external-fitness.css';
import '../styles/responsive.css';

export const metadata: Metadata = {
  title: 'RunRealm - Cross-Chain Running GameFi',
  description:
    'Transform your runs into valuable NFT territories. Claim, trade, and defend real-world running territories on ZetaChain.',
  applicationName: 'RunRealm',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RunRealm',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1a1a',
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
      <body>{children}</body>
    </html>
  );
}
