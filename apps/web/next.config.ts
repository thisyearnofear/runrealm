import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'dist',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  turbopack: {
    resolveAlias: {
      '@zetachain/client': './src/lib/zetachain-client-stub.ts',
    },
  },
};

export default nextConfig;
