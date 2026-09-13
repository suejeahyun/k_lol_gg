import type { Metadata } from "next";

import { DestructionCompetitionList } from "../competition-list-views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "멸망전", description: "K-LOL.GG 멸망전의 모집, 경매, 예선과 본선 결과를 확인하세요.", alternates: { canonical: "/competitions/destruction" } };

export default DestructionCompetitionList;
