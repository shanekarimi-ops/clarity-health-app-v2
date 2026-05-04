/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Required for @react-pdf/renderer to work in Next.js App Router.
  // The library is bundled in a way that conflicts with Next's default optimizer.
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
};

module.exports = nextConfig;