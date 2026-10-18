import { defineConfig, devices } from "@playwright/test";

const CYCLE_MS = 150 * 60_000;
// Freeze the mock clock at cycle position 40 min so the set of live matches
// (and which have demo streams) is known. See tests/unit/mock-provider.test.ts.
const frozen = new Date(Math.floor(Date.now() / CYCLE_MS) * CYCLE_MS + 40 * 60_000).toISOString();
const PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/meta`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { SPORTS_PROVIDER: "mock", STREAM_PROVIDER: "mock", MOCK_FREEZE_TIME: frozen, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
