import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
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
      "bunx next build --webpack && AUTH_RATE_LIMIT=off bunx next start --hostname localhost --port 3000",
    url: "http://localhost:3000/sign-in",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
