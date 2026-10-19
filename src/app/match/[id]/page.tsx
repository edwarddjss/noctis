import type { Metadata } from "next";
import { MatchView } from "./MatchView";

export const metadata: Metadata = { title: "Match" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchView id={id} />;
}
