import { expect, test } from "@playwright/test";

test("home loads directory API and opens match channel options", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  await page.goto("/");
  await expect(page).toHaveURL(/\/live$/);
  const list = page.getByTestId("directory-list");
  await expect(list).toContainText("Fluminense vs Santos");
  expect(requests).toContain("/api/v1/catalog");
  expect(requests).not.toContain("/api/live");
  await page.getByLabel("Search matches").fill("missing team");
  await expect(page.getByText("No matches found")).toBeVisible();
  await page.getByLabel("Search matches").fill("Santos");
  await list.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Fluminense vs Santos" })).toBeVisible();
  await expect(page.getByText("Premiere 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
  expect(requests).toContain("/api/v1/matches/41326");
});

test("directory errors offer retry", async ({ page }) => {
  await page.route("**/api/v1/catalog", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/live");
  await expect(page.getByRole("button", { name: /try again|retry/i })).toBeVisible();
});


test("Vini Jr autocomplete shows a player card with club and a follow action", async ({ page }) => {
  await page.goto("/following");
  await page.getByTestId("search-input").fill("vini jr");
  const card = page.getByTestId("player-card");
  await expect(card).toContainText("Vinícius Júnior");
  await expect(card).toContainText("Real Madrid");
  await expect(card).toContainText("Brazil");
  await expect(card.getByRole("link", { name: "View Vinícius Júnior" })).toHaveAttribute("href", "/player/esp.1.252107");
  await card.getByRole("button", { name: "Follow Vinícius Júnior", exact: true }).click();
  await expect(card.getByRole("button", { name: "Unfollow Vinícius Júnior" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "/workspace/scratch/6eeed386d3d6/player-search-mobile.png", fullPage: true });
});


test("embedded channel blocks provider popups and top-level ad redirects", async ({ page, context }) => {
  await page.route("https://tvf90.com/**", route => route.fulfill({
    contentType: "text/html",
    body: `<button id="play">Play</button><script>
      document.querySelector('#play').onclick = () => {
        window.popupBlocked = window.open('https://ads.example.test/') === null;
        try { top.location.href = 'https://ads.example.test/'; } catch { window.redirectBlocked = true; }
      };
    </script>`,
  }));
  await page.goto("/directory/41326");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  const frame = page.frameLocator('[data-testid="directory-player"]');
  await frame.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.frames().find(f => f.url().startsWith("https://tvf90.com/"))?.evaluate(() => (window as unknown as { popupBlocked: boolean }).popupBlocked)).toBe(true);
  await expect(page).toHaveURL(/\/directory\/41326$/);
  expect(context.pages()).toHaveLength(1);
  await expect(page.getByTestId("directory-player")).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(page.getByTestId("directory-player")).toHaveCount(0);
});
