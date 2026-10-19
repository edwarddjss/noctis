import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const STUB = 3299;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure",
    launchOptions: process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : undefined },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: [
    {
      // deterministic stand-in for ESPN's JSON (tests/fixtures/espn.ts)
      command: `node tests/e2e/espn-stub.mts`,
      url: `http://localhost:${STUB}/health`,
      env: { STUB_PORT: String(STUB) },
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
      url: `http://localhost:${PORT}/api/meta`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        SPORTS_PROVIDER: "espn",
        DIRECTORY_URL: `http://localhost:${STUB}/diaries.json`,
        ESPN_BASE_URL: `http://localhost:${STUB}`,
        ESPN_WEB_BASE_URL: `http://localhost:${STUB}`,
        STREAM_PROVIDER: "config",
        STREAM_CONFIG_PATH: "tests/fixtures/streams.e2e.json",
        STREAM_ALLOW_LOCAL_MEDIA: "1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
