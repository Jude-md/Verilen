import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["sharp"],
  // Ship the demo portrait catalog inside the serverless bundle so seeding can
  // compute fingerprints on Vercel (public/ is otherwise CDN-only).
  outputFileTracingIncludes: {
    "/**": ["./public/profiles/**", "./public/samples/**"],
  },
};

export default nextConfig;
