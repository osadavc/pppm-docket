import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // CVs are uploaded through a Server Action; the default 1MB limit rejects
    // an ordinary PDF with an opaque error.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
