import path from "node:path";

const config = {
  plugins: {
    [path.resolve("scripts/postcss/nexus-module-markers.cjs")]: {
      serviceId: process.env.NEXT_PUBLIC_SERVICE_ID ?? "klol",
      sourceRoot: path.resolve("src"),
    },
    "@tailwindcss/postcss": {},
  },
};

export default config;
