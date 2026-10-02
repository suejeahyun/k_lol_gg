import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { EventCompetitionList } from "../competition-list-views";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/competitions/events");

export default EventCompetitionList;
