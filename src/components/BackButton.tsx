"use client";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function BackButton({ fallback = "/live" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    >
      <Icon name="back" />
    </button>
  );
}
