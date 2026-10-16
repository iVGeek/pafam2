import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Trading data must always be read fresh from Postgres, so use the classic
  // dynamic-rendering model rather than Cache Components.
  cacheComponents: false,
  serverExternalPackages: ["@prisma/client", "exceljs", "unpdf"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
