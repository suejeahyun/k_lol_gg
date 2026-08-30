import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    // Use a non-pooled connection for migrations when the hosting provider
    // exposes one; application runtime continues to use DATABASE_URL.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },

  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
