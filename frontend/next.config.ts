import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["fhevmjs", "node-tfhe", "tfhe"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
