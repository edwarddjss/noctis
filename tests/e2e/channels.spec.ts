import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { LIVE_CHANNELS } from "../../src/lib/channels";

test("channel API is curated and unknown channels return 404", async ({ request }) => {
  const response = await request.get("/api/channels");
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const { channels } = await response.json();
  expect(channels.map((c: { id: string }) => c.id)).toEqual(["golazo", "bein-xtra", "africa24"]);
  expect((await request.get("/channels/not-a-channel")).status()).toBe(404);
});

test("channel navigation plays media without provider frames or new tabs", async ({ page, context }) => {
  // The bundled Linux Chromium lacks H.264. Exercise the native-player path
  // with a real, decodable WebM fixture; live HLS is tested separately below.
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (mime) {
      return mime === "application/vnd.apple.mpegurl" ? "probably" : original.call(this, mime);
    };
  });
  const mediaRequests: string[] = [];
  await page.route("https://dai.google.com/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    mediaRequests.push(pathname);
    const body = await readFile("public/demo/demo-a.webm");
    await route.fulfill({ body, contentType: "video/webm", headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/live");
  await page.getByRole("link", { name: "Watch live channels →" }).click();
  await page.getByRole("link", { name: /CBS Sports Golazo Network/ }).click();
  await page.getByRole("button", { name: "Play CBS Sports Golazo Network", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(1);
  expect(mediaRequests.some(path => path.endsWith(".m3u8"))).toBe(true);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("link", { name: "Choose another channel" }).click();
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("link", { name: /Africa 24 Sport/ }).click();
  await expect(page.getByRole("heading", { name: "Africa 24 Sport" })).toBeVisible();
});

test("a denied feed shows an error without opening a provider website", async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (mime) {
      return mime === "application/vnd.apple.mpegurl" ? "probably" : original.call(this, mime);
    };
  });
  await page.route("https://dai.google.com/**", route => route.fulfill({ status: 403, body: "Denied", headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/channels/golazo");
  await page.getByRole("button", { name: "Play CBS Sports Golazo Network", exact: true }).click();
  await expect(page.getByTestId("video-player")).toHaveAttribute("data-state", "error", { timeout: 20_000 });
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(context.pages()).toHaveLength(1);
});

for (const channel of LIVE_CHANNELS) {
  test(`live feed: ${channel.name}`, async ({ page, context }, testInfo) => {
    test.skip(process.env.TEST_LIVE_CHANNELS !== "1", "Opt-in network verification; public broadcasts can change.");
    const supported = await page.evaluate(() => Boolean(document.createElement("video").canPlayType("application/vnd.apple.mpegurl")) || (typeof MediaSource !== "undefined" && MediaSource.isTypeSupported('video/mp4; codecs="avc1.4d401e,mp4a.40.2"')));
    test.skip(!supported, "This browser cannot decode H.264/AAC; use TEST_BROWSER_PATH with a codec-enabled browser.");
    test.setTimeout(60_000);
    const failures: string[] = [];
    page.on("console", msg => { if (msg.type() === "error") failures.push(msg.text()); });
    await page.goto(`/channels/${channel.id}`);
    await page.getByRole("button", { name: `Play ${channel.name}`, exact: true }).click();
    try {
      await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 45_000 }).toBeGreaterThan(2);
    } finally {
      await testInfo.attach("browser-errors", { body: failures.join("\n"), contentType: "text/plain" });
    }
    expect(await page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    expect(context.pages()).toHaveLength(1);
    await expect(page.locator("iframe")).toHaveCount(0);
  });
}
