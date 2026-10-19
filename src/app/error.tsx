"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page">
      <div className="empty empty--error" role="alert">
        <p className="empty__title">Something went wrong</p>
        <p className="empty__body">Please try again. If it keeps happening, the data source may be temporarily unavailable.</p>
        <button type="button" className="btn btn--small" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
