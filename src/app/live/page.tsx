import type { Metadata } from "next";
import { LiveView } from "./LiveView";

export const metadata: Metadata = { title: "Matches" };

export default function LivePage() {
  return <LiveView />;
}
