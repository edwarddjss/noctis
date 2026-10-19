/**
 * Local stand-in for ESPN's soccer JSON, used only by Playwright so e2e tests
 * are deterministic and work offline. Started by playwright.config.ts.
 */
import { createServer } from "node:http";
import * as F from "../fixtures/espn.ts";
import { directoryFixture } from "../fixtures/directory.ts";

const PORT = Number(process.env.STUB_PORT ?? 3299);

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const p = url.pathname;
  let body: unknown = null;
  let m: RegExpExecArray | null;
  if ((m = /^\/apis\/site\/v2\/sports\/soccer\/([^/]+)\/scoreboard$/.exec(p))) body = F.scoreboard(m[1]!);
  else if ((m = /^\/apis\/site\/v2\/sports\/soccer\/([^/]+)\/teams$/.exec(p))) body = F.teamsList(m[1]!);
  else if ((m = /^\/apis\/site\/v2\/sports\/soccer\/[^/]+\/teams\/(\d+)$/.exec(p))) body = F.teamDetail(m[1]!);
  else if ((m = /^\/apis\/site\/v2\/sports\/soccer\/[^/]+\/teams\/(\d+)\/roster$/.exec(p))) body = F.roster(m[1]!);
  else if ((m = /^\/apis\/site\/v2\/sports\/soccer\/[^/]+\/teams\/(\d+)\/schedule$/.exec(p))) body = F.schedule(m[1]!, url.searchParams.get("fixture") === "true");
  else if (/^\/apis\/site\/v2\/sports\/soccer\/[^/]+\/summary$/.test(p)) body = F.summary(url.searchParams.get("event") ?? "");
  else if ((m = /^\/apis\/v2\/sports\/soccer\/([^/]+)\/standings$/.exec(p))) body = F.standings(m[1]!);
  else if (p === "/apis/common/v3/search") body = F.search(url.searchParams.get("query") ?? "");
  else if ((m = /^\/apis\/common\/v3\/sports\/soccer\/[^/]+\/athletes\/(\d+)$/.exec(p))) body = F.athlete(m[1]!);
  else if (p === "/diaries.json") body = directoryFixture;
  else if (p === "/health") body = { ok: true };
  res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
  res.end(JSON.stringify(body ?? { code: 404, message: "Not found" }));
}).listen(PORT, () => console.log(`espn stub on ${PORT}`));
