import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EventParticipationPage({ params }: PageProps) {
  const { eventId } = await params;

  redirect(`/progress/event/${eventId}`);
}
