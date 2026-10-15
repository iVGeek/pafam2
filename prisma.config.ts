import { defineConfig } from "prisma/config";

// When prisma.config.ts is present the CLI no longer auto-loads .env, so we
// load it ourselves (Node 20.12+ built-in; no extra dependency).
try {
  process.loadEnvFile();
} catch {
  // .env is optional when DATABASE_URL is already provided by the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
