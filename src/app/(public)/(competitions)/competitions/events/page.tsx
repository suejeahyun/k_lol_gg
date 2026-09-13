import type { Metadata } from "next";

import { EventCompetitionList } from "../competition-list-views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이벤트 대회", description: "K-LOL.GG 이벤트 대회의 모집, 팀, 대진과 결과를 확인하세요.", alternates: { canonical: "/competitions/events" } };

export default EventCompetitionList;
