import { Icon } from "./Icon";

export function EmptyState({ icon = "info", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty" role="status">
      <Icon name={icon} size={32} />
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty empty--error" role="alert">
      <p className="empty__title">Couldn't load</p>
      <p className="empty__body">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function NoStream() {
  return (
    <div className="no-stream" data-testid="no-stream" role="status">
      <Icon name="video" size={28} />
      <p className="no-stream__title">No authorized stream available</p>
      <p className="small muted">
        MatchNest only plays streams supplied by a licensed provider or an administrator with the rights to this match. Live score and match info are still
        available here.
      </p>
    </div>
  );
}
