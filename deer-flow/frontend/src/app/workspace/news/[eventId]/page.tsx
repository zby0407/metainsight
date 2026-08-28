import { NewsWorkspace } from "@/components/news/news-workspace";

export default async function NewsEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <NewsWorkspace eventId={eventId} />;
}
