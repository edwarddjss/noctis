import { expect, test } from "vitest";
import { embeddedPlayerUrl } from "@/lib/directory/player-policy";

test("only embeds explicitly allowed HTTPS origins without embedded credentials", () => {
  expect(embeddedPlayerUrl("https://tvf90.com/1.php?stream=premiere2")).toBe("https://tvf90.com/1.php?stream=premiere2");
  for (const url of [null, "javascript:alert(1)", "http://tvf90.com/", "https://ads.example/", "https://tvf90.com.evil.test/", "https://name:password@tvf90.com/", "https://tvf90.com:8080/"]) expect(embeddedPlayerUrl(url)).toBeNull();
});
