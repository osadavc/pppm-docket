import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit bundles this file with esbuild, which bypasses Bun's automatic
// .env loading — so load it explicitly.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  // DDL and advisory locks need a session connection (port 5432), not the
  // transaction pooler used at runtime.
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
  verbose: true,
  strict: true,
});
