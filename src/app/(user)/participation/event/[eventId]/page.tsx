import EventParticipationClient from "./EventParticipationClient";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EventParticipationPage({ params }: PageProps) {
  const { eventId } = await params;

  return <EventParticipationClient eventId={eventId} />;
}
