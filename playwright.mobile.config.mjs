import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./scripts/mobile-ui",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    serviceWorkers: "block",
  },
  webServer: {
    env: { VITE_WEB_PUSH_PUBLIC_KEY: "fixture-public-key" },
    command:
      "npm run dev --prefix frontend -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/mobile/",
    reuseExistingServer: false,
  },
  reporter: "list",
  outputDir: "test-results/mobile",
});
