import { expect, test } from "@playwright/test";

// Known at the frozen mock time (see playwright.config.ts):
const WITH_STREAM = "m-pd-r3-1"; // live, demo stream with captions
const NO_STREAM = "m-pd-r3-3"; // live (half-time), no authorized stream
const BROKEN_STREAM = "m-ch-r3-1"; // live, configured stream that 404s

test("follow and unfollow a team", async ({ page }) => {
  await page.goto("/following");
  await expect(page.getByText("Follow teams, players or leagues")).toBeVisible();
  await page.getByTestId("search-input").fill("Cobalt");
  const follow = page.getByRole("button", { name: "Follow Cobalt Rovers" });
  await follow.click();
  await expect(page.getByTestId("search-results").getByRole("button", { name: "Unfollow Cobalt Rovers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("follow-chips")).toContainText("Cobalt Rovers");
  await expect(page.getByTestId("following-feed")).toContainText("Cobalt Rovers");

  // persists across reloads
  await page.reload();
  await expect(page.getByTestId("follow-chips")).toContainText("Cobalt Rovers");

  await page.getByTestId("follow-chips").getByRole("button", { name: "Unfollow Cobalt Rovers" }).click();
  await expect(page.getByTestId("follow-chips")).toHaveCount(0);
  await expect(page.getByText("Follow teams, players or leagues")).toBeVisible();
});

test("live tab shows live matches grouped by competition with stream availability", async ({ page }) => {
  await page.goto("/live");
  const list = page.getByTestId("live-list");
  await expect(list.getByTestId("match-row")).toHaveCount(6);
  await expect(list).toContainText("Mock Premier Division");
  await expect(list).toContainText("Mock Championship");
  const withVideo = list.locator(`[data-match-id="${WITH_STREAM}"]`);
  await expect(withVideo).toContainText("Video");
  await expect(list.locator(`[data-match-id="${NO_STREAM}"]`)).toContainText("Score only");
  await expect(list.locator(`[data-match-id="${NO_STREAM}"]`)).toContainText("HT");

  await page.getByLabel(/Only matches with authorized video/).check();
  await expect(list.getByTestId("match-row")).toHaveCount(4);
});

test("match without an authorized stream shows the unavailable state and no Watch button", async ({ page }) => {
  await page.goto(`/match/${NO_STREAM}`);
  await expect(page.getByTestId("score-header")).toBeVisible();
  await expect(page.getByTestId("no-stream")).toContainText("No authorized stream available");
  await expect(page.getByTestId("watch-button")).toHaveCount(0);

  // going straight to the watch URL also refuses
  await page.goto(`/watch/${NO_STREAM}`);
  await expect(page.getByTestId("no-stream")).toBeVisible();
  await expect(page.getByTestId("video-player")).toHaveCount(0);
});

test("opens one authorized stream and plays after a user gesture", async ({ page }) => {
  await page.goto(`/match/${WITH_STREAM}`);
  await page.getByTestId("watch-button").click();
  await expect(page).toHaveURL(new RegExp(`/watch/${WITH_STREAM}$`));
  const player = page.getByTestId("video-player");
  await expect(player).toHaveAttribute("data-state", "idle"); // no autoplay
  await player.getByRole("button", { name: /^Play / }).click();
  await expect(player).toHaveAttribute("data-state", /playing|buffering/, { timeout: 15_000 });
  await expect(page.locator("video")).toHaveJSProperty("muted", true);
  await player.getByRole("button", { name: "Unmute" }).click();
  await expect(page.locator("video")).toHaveJSProperty("muted", false);
  await player.getByRole("button", { name: "Pause" }).click();
  await expect(player).toHaveAttribute("data-state", "paused");
  await expect(page.getByTestId("score-header")).toBeVisible(); // match info stays under the player
});

test("playback failure is handled gracefully", async ({ page }) => {
  await page.goto(`/watch/${BROKEN_STREAM}`);
  const player = page.getByTestId("video-player");
  await player.getByRole("button", { name: /^Play / }).click();
  await expect(player).toHaveAttribute("data-state", "error", { timeout: 15_000 });
  await expect(player.getByRole("alert")).toBeVisible();
  await expect(player.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("score-header")).toBeVisible();
});

test("multi-view opens with panels, a bandwidth warning and independent mute", async ({ page }) => {
  await page.goto("/live");
  await page.getByTestId("open-multiview").click();
  await expect(page).toHaveURL(/\/multiview/);
  await page.getByTestId("layout-4").click();
  await expect(page.getByTestId("bandwidth-warning")).toBeVisible();
  for (let i = 0; i < 4; i++) await expect(page.getByTestId(`mv-panel-${i}`)).toBeVisible();

  await page.getByTestId("mv-select-0").selectOption(WITH_STREAM);
  await page.getByTestId("mv-select-1").selectOption("m-pd-r3-2");
  await page.getByTestId("mv-start").click();

  const p0 = page.getByTestId("mv-player-0");
  const p1 = page.getByTestId("mv-player-1");
  await expect(p0).toHaveAttribute("data-state", /playing|buffering/, { timeout: 15_000 });
  await expect(p1).toHaveAttribute("data-state", /playing|buffering/, { timeout: 15_000 });
  // all panels start muted; unmuting one leaves the other muted
  await p0.getByRole("button", { name: "Unmute" }).click();
  await expect(p0.locator("video")).toHaveJSProperty("muted", false);
  await expect(p1.locator("video")).toHaveJSProperty("muted", true);

  // expanding a panel pauses the others
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
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("APP SHELL CACHING ONLY");
  const icon = await request.get("/icons/180");
  expect(icon.headers()["content-type"]).toContain("image/png");
});
