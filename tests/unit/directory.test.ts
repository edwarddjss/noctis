import { test } from "vitest";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createDirectoryHandler } from "../../src/lib/directory/app.ts";
import { DirectoryStore } from "../../src/lib/directory/store.ts";
import { decodePlayerUrl, parseDirectory, parseLimaKickoff } from "../../src/lib/directory/parse.ts";

function createApi(store: DirectoryStore) {
  const handler = createDirectoryHandler(store);
  return createServer(async (req, res) => {
    const response = await handler(new Request(new URL(req.url ?? "/", "http://localhost"), { method: req.method }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
}

const embed = (host: string, path: string) => `/embed/eventos.html?r=${Buffer.from(`https://${host}${path}`).toString("base64")}`;
const fixture = {
  data: [
    {
      id: 41326,
      attributes: {
        diary_description: "Brasileirão: Fluminense vs Santos", date_diary: "2026-10-18", diary_hour: "14:00:00",
        country: { data: { attributes: { name: "Brasil" } } },
        embeds: { data: [
          { id: 10, attributes: { embed_name: "Premiere 2", embed_iframe: embed("tvf90.com", "/1.php?stream=premiere2") } },
          { id: 11, attributes: { embed_name: "Premiere 2 | OP2", embed_iframe: embed("tvf90.com", "/2.php?stream=premiere2") } }
        ] }
      }
    },
    {
      id: 41327,
      attributes: {
        diary_description: "Primera A: Rionegro Aguilas vs Tolima", date_diary: "2026-10-18", diary_hour: "16:30:00",
        country: { data: { attributes: { name: "Colombia" } } },
        embeds: { data: [
          { id: 20, attributes: { embed_name: "Win Sports+", embed_iframe: embed("tvf90.com", "/1.php?stream=winsports2") } },
        ] }
      }
    },
    {
      id: 41328,
      attributes: {
        diary_description: "Primera A: Llaneros vs Santa Fe", date_diary: "2026-10-18", diary_hour: "18:05:00",
        country: { data: { attributes: { name: "Colombia" } } },
        embeds: { data: [{ id: 20, attributes: { embed_name: "Win Sports+", embed_iframe: embed("tvf90.com", "/1.php?stream=winsports2") } }] }
      }
    },
    {
      id: 41329,
      attributes: {
        diary_description: "Serie A: Milan vs Roma", date_diary: "2026-10-19", diary_hour: "14:00:00",
        country: { data: { attributes: { name: "Italia" } } },
        embeds: { data: [{ id: 24, attributes: { embed_name: "ESPN", embed_iframe: embed("tvf90.com", "/canal.php?stream=espn") } }] }
      }
    },
    {
      id: 41330,
      attributes: {
        diary_description: "Serie A: Barcelona SC vs Universidad Católica", date_diary: "2026-10-19", diary_hour: "14:00:00",
        country: { data: { attributes: { name: "Ecuador" } } },
        embeds: { data: [{ id: 25, attributes: { embed_name: "ESPN premium DRM", embed_iframe: embed("tv-90.com", "/drm/espnpremiumar.php") } }] }
      }
    }
  ]
};

function mockStore(now = () => Date.parse("2026-10-18T18:30:00Z")) {
  let count = 0;
  const fetcher: typeof fetch = async () => {
    count++;
    return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
  };
  return {
    store: new DirectoryStore({ fetcher, now, ttlMs: 60_000 }),
    requestCount: () => count
  };
}

async function withServer(store: DirectoryStore, fn: (url: string) => Promise<void>): Promise<void> {
  const app: Server = createApi(store);
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const address = app.address();
  assert.ok(address && typeof address !== "string");
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => app.close(err => err ? reject(err) : resolve())); }
}

async function json(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

test("parses Strapi options, reusable channels, time zones and DRM separately", () => {
  const rows = parseDirectory(fixture);
  assert.equal(rows.length, 5);
  assert.equal(rows[0]?.kickoff, "2026-10-18T19:00:00.000Z");
  assert.equal(rows[0]?.options[0]?.channelId, "premiere2");
  assert.equal(rows[4]?.options[0]?.technology, "drm-bitmovin");
  assert.equal(rows[4]?.options[0]?.channelId, "espnpremiumar");
  assert.notEqual(rows[3]?.leagueSlug, rows[4]?.leagueSlug);
  assert.equal(parseLimaKickoff("2026-02-31", "14:00:00"), null);
  assert.equal(decodePlayerUrl("/embed/eventos.html?r=" + Buffer.from("javascript:alert(1)").toString("base64")), null);
});

test("all REST routes return mapped options and correct groups, filters, counts", async () => {
  const { store, requestCount } = mockStore();
  await withServer(store, async base => {
    const results = await json(`${base}/api/v1/matches?q=santos`);
    assert.equal(results.status, 200);
    assert.equal(results.body.total, 1);
    assert.equal(results.body.items[0].teams, "Fluminense vs Santos");
    assert.equal(results.body.items[0].status, "upcoming");
    assert.equal(results.body.items[0].options.length, 2);
    assert.equal(results.body.items[0].options[0].playerPageUrl, "https://tvf90.com/1.php?stream=premiere2");
    assert.equal(results.body.meta.statusIsInferred, true);

    const match = await json(`${base}/api/v1/matches/41326/options`);
    assert.equal(match.body.options[0].provider, "tvf90.com");
    const option = await json(`${base}/api/v1/matches/41326/options/10`);
    assert.equal(option.body.option.channelId, "premiere2");
    const catalog = await json(`${base}/api/v1/catalog`);
    assert.equal(catalog.body.matchCount, 5);
    assert.equal(catalog.body.leagues.length, 4);
    const leagues = await json(`${base}/api/v1/leagues`);
    assert.equal(leagues.body.total, 4);
    assert.equal(leagues.body.items.filter((x: { name: string }) => x.name === "Serie A").length, 2);
    const league = await json(`${base}/api/v1/leagues/serie-a-italia/matches`);
    assert.equal(league.body.total, 1);
    assert.equal(league.body.items[0].id, "41329");

    const channels = await json(`${base}/api/v1/channels`);
    assert.equal(channels.body.total, 4);
    const winsports = channels.body.items.find((c: { id: string }) => c.id === "winsports2");
    assert.equal(winsports.matchCount, 2);
    assert.equal(winsports.optionCount, 2);
    const channelMatches = await json(`${base}/api/v1/channels/winsports2/matches?provider=tvf90.com`);
    assert.equal(channelMatches.body.total, 2);

    const providers = await json(`${base}/api/v1/providers`);
    assert.equal(providers.body.total, 2);
    const providerMatches = await json(`${base}/api/v1/providers/tv-90.com/matches`);
    assert.equal(providerMatches.body.total, 1);
    assert.equal((await json(`${base}/api/v1/matches?date=2026-10-19`)).body.total, 2);
    assert.equal((await json(`${base}/api/v1/matches?limit=2&offset=2`)).body.items.length, 2);
    assert.equal((await json(`${base}/api/v1/matches?status=live-inferred`)).body.total, 0);
    assert.equal((await json(`${base}/api/v1/matches?limit=999`)).status, 400);
    assert.equal((await json(`${base}/api/v1/matches/does-not-exist`)).status, 404);
    assert.equal((await json(`${base}/api/v1/health`)).status, 200);
    assert.equal(requestCount(), 1, "requests inside TTL must share cached upstream fetch");
  });
});

test("serves stale last-known-good snapshot when upstream temporarily fails", async () => {
  let now = Date.parse("2026-10-18T18:00:00Z");
  let fail = false;
  let count = 0;
  const fetcher: typeof fetch = async () => {
    count++;
    if (fail) throw new Error("temporary upstream problem");
    return new Response(JSON.stringify(fixture), { status: 200 });
  };
  const store = new DirectoryStore({ fetcher, now: () => now, ttlMs: 1_000 });
  let data = await store.getMatches();
  assert.equal(data.matches.length, 5);
  assert.equal(data.meta.stale, false);
  now += 1001;
  fail = true;
  data = await store.getMatches();
  assert.equal(data.matches.length, 5);
  assert.equal(data.meta.stale, true);
  assert.equal(count, 2);
});

test("returns 503 when first upstream request fails and no cached directory exists", async () => {
  const fetcher: typeof fetch = async () => { throw new Error("offline"); };
  const store = new DirectoryStore({ fetcher });
  await withServer(store, async base => {
    const res = await json(`${base}/api/v1/matches`);
    assert.equal(res.status, 503);
  });
});
