import type { Metadata } from "next";
import { WatchView } from "./WatchView";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchView id={id} />;
}
