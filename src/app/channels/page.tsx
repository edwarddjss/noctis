import Link from "next/link";
import { LIVE_CHANNELS } from "@/lib/channels";

export default function ChannelsPage() {
  return <div className="page">
    <header className="page__header"><Link href="/live">← Matches</Link></header>
    <h1>Live channels</h1>
    <p className="muted pad">Watch directly in Noctis. No popup player pages.</p>
    <ul className="card list">{LIVE_CHANNELS.map(channel => <li className="list__row" key={channel.id}>
      <Link className="list__main" href={`/channels/${channel.id}`}>
        <span><span className="list__title">{channel.name}</span><span className="list__sub">{channel.description}</span></span>
        <span className="directory-match__arrow" aria-hidden>→</span>
      </Link>
    </li>)}</ul>
    <p className="small muted pad">Channel schedules and regional availability vary. Broadcast commercials may appear. These channels do not cover every match in the directory.</p>
  </div>;
}
