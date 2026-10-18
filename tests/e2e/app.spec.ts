import { expect, test } from "@playwright/test";

// Fixture matches served by tests/e2e/espn-stub.ts (tests/fixtures/espn.ts):
const WITH_STREAM = "eng.1.900001"; // Arsenal v Chelsea, live 67', test stream with captions
const SECOND_STREAM = "eng.1.900003"; // Tottenham v Man United, live 12', test stream
const NO_STREAM = "eng.1.900002"; // Liverpool v Man City, half-time, no stream
const BROKEN_STREAM = "eng.1.900004"; // configured stream whose media 404s

// Logos point at ESPN's CDN; don't let tests wait on the network for them.
test.beforeEach(async ({ page }) => {
  await page.route(/espncdn\.com/, (route) => route.abort());
});

test("follow and unfollow a team", async ({ page }) => {
  await page.goto("/following");
  await expect(page.getByText("Follow teams, players or leagues")).toBeVisible();
  await expect(page.getByTestId("popular-leagues")).toContainText("Premier League");
  await page.getByTestId("search-input").fill("Arsenal");
  await page.getByTestId("search-results").getByRole("button", { name: "Follow Arsenal" }).click();
  await expect(page.getByTestId("search-results").getByRole("button", { name: "Unfollow Arsenal" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("follow-chips")).toContainText("Arsenal");
  await expect(page.getByTestId("following-feed")).toContainText("Chelsea"); // live match vs Chelsea
  await expect(page.getByTestId("following-feed")).toContainText("Everton"); // recent result

  await page.reload();
  await expect(page.getByTestId("follow-chips")).toContainText("Arsenal");

  await page.getByTestId("follow-chips").getByRole("button", { name: "Unfollow Arsenal" }).click();
  await expect(page.getByTestId("follow-chips")).toHaveCount(0);
  await expect(page.getByText("Follow teams, players or leagues")).toBeVisible();
});

test("follow a player adds their club's matches", async ({ page }) => {
  await page.goto("/following");
  await page.getByRole("tab", { name: "Players" }).click();
  await page.getByTestId("search-input").fill("Saka");
  await page.getByTestId("search-results").getByRole("button", { name: "Follow Bukayo Saka" }).click();
  await expect(page.getByTestId("following-feed")).toContainText("Arsenal");
});

test("live tab shows live matches grouped by competition with stream availability", async ({ page }) => {
  await page.goto("/live");
  const list = page.getByTestId("live-list");
  await expect(list.getByTestId("match-row")).toHaveCount(4);
  await expect(list.locator("h2").first()).toContainText("Premier League"); // priority order
  await expect(list).toContainText("LaLiga");
  await expect(list.locator(`[data-match-id="${WITH_STREAM}"]`)).toContainText("Video");
  await expect(list.locator(`[data-match-id="${WITH_STREAM}"]`)).toContainText("67'");
  await expect(list.locator(`[data-match-id="${NO_STREAM}"]`)).toContainText("Score only");
  await expect(list.locator(`[data-match-id="${NO_STREAM}"]`)).toContainText("HT");
  await page.getByLabel(/Only matches with authorized video/).check();
  await expect(list.getByTestId("match-row")).toHaveCount(2);
});

test("match without an authorized stream shows the unavailable state and no Watch button", async ({ page }) => {
  await page.goto(`/match/${NO_STREAM}`);
  await expect(page.getByTestId("score-header")).toContainText("Liverpool");
  await expect(page.getByTestId("no-stream")).toContainText("No authorized stream available");
  await expect(page.getByTestId("watch-button")).toHaveCount(0);
  await page.goto(`/watch/${NO_STREAM}`);
  await expect(page.getByTestId("no-stream")).toBeVisible();
  await expect(page.getByTestId("video-player")).toHaveCount(0);
});

test("match page shows goal events", async ({ page }) => {
  await page.goto(`/match/${WITH_STREAM}`);
  await expect(page.getByTestId("score-header")).toContainText("2 – 1");
  await expect(page.locator(".events")).toContainText("Bukayo Saka");
  await expect(page.locator(".events")).toContainText("Cole Palmer");
});

test("day strip shows every match on a day, not just live ones", async ({ page }) => {
  await page.goto("/live");
  await page.getByTestId("day-strip").getByRole("tab", { name: "Today" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Matches");
  const list = page.getByTestId("live-list");
  await expect(list.getByTestId("match-row")).toHaveCount(6);
  await expect(list).toContainText("Newcastle United"); // scheduled
  await expect(list.locator('[data-match-id="eng.1.900005"]')).toContainText("FT"); // finished
  await page.getByTestId("day-strip").getByRole("tab", { name: "Live" }).click();
  await expect(list.getByTestId("match-row")).toHaveCount(4);
});

test("match page shows line-ups and team page links to its league", async ({ page }) => {
  await page.goto(`/match/${WITH_STREAM}`);
  const lineups = page.getByTestId("lineups");
  await expect(lineups).toContainText("4-3-3");
  await expect(lineups).toContainText("David Raya");
  await expect(lineups).toContainText("Cole Palmer");
  await page.goto("/team/eng.1.359");
  await expect(page.getByText("Bukayo Saka")).toBeVisible();
  await page.getByTestId("team-league-link").click();
  await expect(page).toHaveURL(/\/competition\/eng\.1$/);
});

test("unknown pages show a friendly not-found screen", async ({ page }) => {
  await page.goto("/this-does-not-exist");
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("league page shows the table", async ({ page }) => {
  await page.goto("/competition/eng.1");
  await page.getByRole("tab", { name: "Table" }).click();
  const table = page.getByTestId("standings");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table.locator("tbody tr").first()).toContainText("Arsenal");
  await expect(table.locator("tbody tr").first()).toContainText("20");
});

test("opens one authorized stream and plays after a user gesture", async ({ page }) => {
  await page.goto(`/match/${WITH_STREAM}`);
  await page.getByTestId("watch-button").click();
  await expect(page).toHaveURL(new RegExp(`/watch/${WITH_STREAM.replace(/\./g, "\\.")}$`));
  const player = page.getByTestId("video-player");
  await expect(player).toHaveAttribute("data-state", "idle");
  await player.getByRole("button", { name: /^Play / }).click();
  await expect(player).toHaveAttribute("data-state", /playing|buffering/, { timeout: 15_000 });
  await expect(page.locator("video")).toHaveJSProperty("muted", true);
  await player.getByRole("button", { name: "Unmute" }).click();
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  await player.getByRole("button", { name: "Pause" }).click();
  await expect(player).toHaveAttribute("data-state", "paused");
  await expect(page.getByTestId("score-header")).toBeVisible();
});

test("playback failure is handled gracefully", async ({ page }) => {
  await page.goto(`/watch/${BROKEN_STREAM}`);
  const player = page.getByTestId("video-player");
  await player.getByRole("button", { name: /^Play / }).click();
  await expect(player).toHaveAttribute("data-state", "error", { timeout: 15_000 });
  await expect(player.getByRole("alert")).toBeVisible();
  await expect(player.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("multi-view opens with panels, a bandwidth warning and independent mute", async ({ page }) => {
  await page.goto("/live");
  await page.getByTestId("open-multiview").click();
  await expect(page).toHaveURL(/\/multiview/);
  await page.getByTestId("layout-4").click();
  await expect(page.getByTestId("bandwidth-warning")).toBeVisible();
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`mv-panel-${i}`)).toBeVisible();

  await page.getByTestId("mv-select-0").selectOption(WITH_STREAM);
  await page.getByTestId("mv-select-1").selectOption(SECOND_STREAM);
  await page.getByTestId("mv-start").click();
  const p0 = page.getByTestId("mv-player-0");
  const p1 = page.getByTestId("mv-player-1");
  await expect(p0).toHaveAttribute("data-state", /playing|buffering/, { timeout: 15_000 });
  await expect(p1).toHaveAttribute("data-state", /playing|buffering/, { timeout: 15_000 });
  await p0.getByRole("button", { name: "Unmute" }).click();
  await expect(p0.locator("video")).toHaveJSProperty("muted", false);
  await expect(p1.locator("video")).toHaveJSProperty("muted", true);

  await p0.getByRole("button", { name: "Expand panel" }).click();
  await expect(p1).toHaveAttribute("data-state", "paused");
  await p0.getByRole("button", { name: "Collapse panel" }).click();
  await expect(p1).toHaveAttribute("data-state", /playing|buffering/, { timeout: 10_000 });

  await page.getByTestId("layout-2").click();
  await expect(page.getByTestId("bandwidth-warning")).toHaveCount(0);
  await expect(page.getByTestId("mv-panel-2")).toHaveCount(0);
});

test("PWA manifest and service worker are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "MatchNest", display: "standalone" });
  const sw = await request.get("/sw.js");
  expect(await sw.text()).toContain("APP SHELL CACHING ONLY");
  expect((await request.get("/icons/180")).headers()["content-type"]).toContain("image/png");
});
