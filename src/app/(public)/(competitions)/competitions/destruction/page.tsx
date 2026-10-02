import { createRouteMetadata } from "@/modules/seo/domain/site-seo";

import { DestructionCompetitionList } from "../competition-list-views";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/competitions/destruction");

export default DestructionCompetitionList;
