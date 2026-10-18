export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="page">
      <div className="empty">
        <p className="empty__title">You&apos;re offline</p>
        <p className="empty__body">MatchNest needs a connection for scores and video. Your follows are saved on this device.</p>
      </div>
    </div>
  );
}
