import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/econs-calculator",
  assetPrefix: "/econs-calculator/",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
