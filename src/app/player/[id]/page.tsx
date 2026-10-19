import type { Metadata } from "next";
import { PlayerView } from "./PlayerView";

export const metadata: Metadata = { title: "Player" };

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerView id={id} />;
}
