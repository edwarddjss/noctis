import { ImageResponse } from "next/og";

export const dynamic = "force-static";
const SIZES: Record<string, { px: number; pad: number }> = {
  "180": { px: 180, pad: 0.12 },
  "192": { px: 192, pad: 0.12 },
  "512": { px: 512, pad: 0.12 },
  maskable: { px: 512, pad: 0.24 }, // keep artwork inside the maskable safe zone
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  const cfg = SIZES[size];
  if (!cfg) return new Response("Not found", { status: 404 });
  const inner = Math.round(cfg.px * (1 - cfg.pad * 2));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0f14" }}>
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: inner * 0.28,
            background: "linear-gradient(135deg, #22c55e 0%, #0ea5e9 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0b0f14",
            fontSize: inner * 0.5,
            fontWeight: 800,
            letterSpacing: -inner * 0.02,
          }}
        >
          MN
        </div>
      </div>
    ),
    { width: cfg.px, height: cfg.px },
  );
}
