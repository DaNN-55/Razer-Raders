import { defineConfig } from "@playwright/test";

const baseURL = process.env.RADAR_E2E_BASE_URL;
if (!baseURL) throw new Error("RADAR_E2E_BASE_URL 未配置。请通过 pnpm test:e2e 运行。");
const channel = process.env.RADAR_PLAYWRIGHT_CHANNEL;

export default defineConfig({
  outputDir: "/tmp/razer-raders-playwright-results",
  testDir: "./test/browser",
  use: {
    baseURL,
    ...(channel ? { channel } : {}),
    headless: true,
  },
});
