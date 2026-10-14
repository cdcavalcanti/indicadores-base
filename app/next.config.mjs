/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Imagens do Instagram vêm do CDN do Facebook/Instagram.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
