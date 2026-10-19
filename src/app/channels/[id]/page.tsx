import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { LIVE_CHANNELS } from "@/lib/channels";

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = LIVE_CHANNELS.find(item => item.id === id);
  if (!channel) notFound();
  return <div className="page">
    <header className="page__header"><Link href="/channels">← Live channels</Link></header>
    <h1>{channel.name}</h1><p className="muted pad">{channel.description}</p>
    <VideoPlayer key={channel.id} sources={channel.sources} title={channel.name} subtitle="Live channel" />
    <p className="small muted pad">Direct playback · Broadcast commercials may appear.</p>
    <p className="small muted pad">If this channel is unavailable in your region, choose another channel.</p>
    <Link className="btn btn--ghost" href="/channels">Choose another channel</Link>
  </div>;
}
