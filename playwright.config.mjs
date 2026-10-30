import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173", reuseExistingServer: false },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    ...(process.env.PW_WEBKIT === "1" ? [
      { name: "webkit", use: { ...devices["Desktop Safari"] } },
      { name: "iphone-15", use: { ...devices["iPhone 15"] } },
    ] : []),
    { name: "pixel", use: { ...devices["Pixel 7"] } },
  ],
});
