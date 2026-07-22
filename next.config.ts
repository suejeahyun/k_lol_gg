import type { NextConfig } from "next";
import { getSecurityHeaderEntries } from "./src/lib/security-policy";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = getSecurityHeaderEntries(isProduction);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ddragon.leagueoflegends.com", pathname: "/**" },
      { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
      { protocol: "https", hostname: "img.youtube.com", pathname: "/**" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/**" },
    ],
  },

  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "bmp-js",
    "idb-keyval",
    "is-url",
    "node-fetch",
    "regenerator-runtime",
    "wasm-feature-detect",
    "zlibjs",
  ],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  outputFileTracingIncludes: {
    "/api/matches/import-lol-result": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/zlibjs/**/*",
    ],
  },
};

export default nextConfig;
