import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.31.70"],
  output: "standalone",
  reactStrictMode: true,
  watchOptions: {
    pollIntervalMs: 1_000,
  },
};

export default nextConfig;
