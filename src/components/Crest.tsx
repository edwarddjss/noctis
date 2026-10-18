/** Team/competition image with an initials fallback when no logo is available. */
"use client";
import { useState } from "react";

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Crest({ name, src, size = 28, round = true }: { name: string; src?: string | null; size?: number; round?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="crest" src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return (
    <span
      className={`crest crest--initials${round ? "" : " crest--square"}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue(name)} 45% 32%)` }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
