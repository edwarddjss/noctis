import type { Metadata } from "next";
import { LiveView } from "./LiveView";

export const metadata: Metadata = { title: "Live" };

export default function LivePage() {
  return <LiveView />;
}
