/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for Cloudflare Pages
  experimental: {
    runtime: 'edge',
  },
}

module.exports = nextConfig
