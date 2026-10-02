import { createRouteMetadata } from "@/modules/seo/domain/site-seo";
import Link from "next/link";
import { ArrowLeft } from "@/components/theme/theme-icons";
import { notFound } from "next/navigation";

import { getCurrentSession } from "@/modules/auth/infrastructure/runtime-session";
import { getRuntimeMatchService } from "@/modules/matches/infrastructure/runtime-match-data";
import { parseMatchSubmitPageQuery } from "@/modules/matches/infrastructure/match-query";
import { loadRuntimeSeasonData } from "@/modules/seasons/infrastructure/runtime-season-data";
import { loadRuntimeTeamBalance } from "@/modules/team-tools/infrastructure/runtime-team-balance";

import { SubmissionForm } from "./submission-form";
import { SiteFeatureStatePanel } from "@/components/site-feature-state";
import { readSiteFeatureState, siteFeatureLabel } from "@/modules/operations/infrastructure/site-feature-access";
import styles from "./submit.module.css";

export const dynamic = "force-dynamic";
export const metadata = createRouteMetadata("/matches/submit");

export default async function MatchSubmitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const featureState = await readSiteFeatureState("matchSubmissions");
  if (featureState !== "enabled") {
    return <div className={`page-wrap ${styles.page}`}><SiteFeatureStatePanel label={siteFeatureLabel("matchSubmissions")} state={featureState} /></div>;
  }
  const session = await getCurrentSession("ACCOUNT");
  const query = parseMatchSubmitPageQuery(await searchParams);
  if (!query) notFound();
  const requestedCode = query.code;
  const code = query.code;
  const service = getRuntimeMatchService();
  const initial = session && service && code
    ? await service.getOwnSubmissionByPublicCode(session.userId, code).catch(() => null)
    : null;
  const seasonResult = await loadRuntimeSeasonData((seasonService) => seasonService.listPublicSeasons());
  const seasons = seasonResult.state === "ready"
    ? seasonResult.data.filter((season) => season.status !== "RETIRED").map(({ id, name }) => ({ id, name }))
    : [];
  const viewer = !session ? "ANONYMOUS" : service ? "APPROVED" : "UNAVAILABLE";
  const requestedTeamBalanceDraftId = query.teamBalanceDraftId;
  const draftResult = session && requestedTeamBalanceDraftId
    ? await loadRuntimeTeamBalance((teamBalanceService) => teamBalanceService.getDraft(
        { actorUserAccountId: session.userId, authorization: "OWNER" },
        requestedTeamBalanceDraftId,
      ))
    : null;
  const teamBalanceDraft = draftResult?.state === "ready" && draftResult.data &&
      draftResult.data.status !== "ARCHIVED" && draftResult.data.selectedCandidateSignature
    ? { id: draftResult.data.id, title: draftResult.data.title, status: draftResult.data.status }
    : null;

  return (
    <div className={`page-wrap ${styles.page}`}>
      <Link className="back-link" href="/matches"><ArrowLeft size={16} aria-hidden="true" /> 경기 결과</Link>
      <section className={styles.hero} aria-labelledby="submit-title"><p>PRIVATE SUBMISSION</p><h1 id="submit-title">결과를 차근차근 접수해요</h1><span>이미지는 비공개로 보관하고, OCR은 후보만 만들며 사람이 확인하기 전에는 공개 경기로 반영하지 않아요.</span></section>
      <SubmissionForm
        viewer={viewer}
        seasons={seasons}
        initial={initial}
        requestedCode={requestedCode}
        requestedTeamBalanceDraftId={requestedTeamBalanceDraftId}
        teamBalanceDraft={teamBalanceDraft}
      />
    </div>
  );
}
