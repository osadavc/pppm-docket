import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

// Overridable so the suite can run while something else holds port 3000.
const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      `bunx next build --webpack && AUTH_RATE_LIMIT=off bunx next start --hostname localhost --port ${port}`,
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
