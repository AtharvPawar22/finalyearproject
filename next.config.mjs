import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      buffer: path.resolve(__dirname, "src/lib/shims/buffer.js"),
      "node:buffer": path.resolve(__dirname, "src/lib/shims/buffer.js"),
    };
    return config;
  },
};

export default nextConfig;
