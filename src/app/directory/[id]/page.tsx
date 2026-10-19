import { DirectoryMatchView } from "./DirectoryMatchView";

export default async function DirectoryMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DirectoryMatchView id={id} />;
}
