import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "50mb",
  },
  // pdfjs-dist's worker breaks when Next chunks it — externalising the
  // family also lets the CJS imports resolve at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth", "xlsx"],
  async redirects() {
    return [
      {
        source: "/project/:id",
        destination: "/",
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
