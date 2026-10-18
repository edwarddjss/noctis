import type { Metadata } from "next";
import { FollowingView } from "./FollowingView";

export const metadata: Metadata = { title: "Following" };

export default function FollowingPage() {
  return <FollowingView />;
}
