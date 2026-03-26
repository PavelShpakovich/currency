import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'admin.myfin.by',
      },
      {
        protocol: 'https',
        hostname: 'admin-global.myfin.by',
      },
      {
        protocol: 'https',
        hostname: 'myfin.by',
      },
    ],
  },
};

export default nextConfig;
