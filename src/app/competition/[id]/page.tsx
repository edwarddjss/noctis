import type { Metadata } from "next";
import { CompetitionView } from "./CompetitionView";

export const metadata: Metadata = { title: "League" };

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompetitionView id={id} />;
}
