import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: '50mb',
  },
  // Keep document-extraction libs out of the webpack bundle — pdfjs-dist
  // ships its own worker that breaks when Next chunks it; mammoth and xlsx
  // are heavyweight CJS that don't gain from bundling. They're loaded as
  // regular Node deps at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth", "xlsx"],
  async redirects() {
    return [
      {
        source: '/project/:id',
        destination: '/',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
