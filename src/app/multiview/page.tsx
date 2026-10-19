import type { Metadata } from "next";
import { MultiView } from "./MultiView";

export const metadata: Metadata = { title: "Multi-view" };

export default async function MultiViewPage({ searchParams }: { searchParams: Promise<{ add?: string | string[] }> }) {
  const { add } = await searchParams;
  const id = typeof add === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(add) ? add : undefined;
  return <MultiView initialMatchId={id} />;
}
