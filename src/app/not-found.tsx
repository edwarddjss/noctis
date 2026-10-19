import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <p className="empty__title">Page not found</p>
        <p className="empty__body">That team, match or page doesn&apos;t exist.</p>
        <Link href="/live" className="btn btn--small">
          Go to Live
        </Link>
      </div>
    </div>
  );
}
