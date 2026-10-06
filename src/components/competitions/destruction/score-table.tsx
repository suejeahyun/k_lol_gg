import { ARAM_AUCTION_MINIMUM_BIDS, DESTRUCTION_GAME_MODES } from "@/modules/competitions/destruction/aram-rating";
import { CLASSIC_CAPTAIN_POINT_TABLE } from "@/modules/competitions/destruction/classic-point-table";
import { COMPETITION_POSITIONS, competitionPositionLabel } from "@/modules/competitions/core";
import type { DestructionPublicDto } from "@/modules/competitions/destruction/state";
import styles from "./workspace.module.css";
import { ABSOLUTE_TIER_FLOORS, RATING_KEYS, ratingLabel } from "@/modules/competitions/destruction/provisional-rating";

const tierRanges = { S: "60% 이상", A: "52.5% 이상 ~ 60% 미만", B: "47.5% 이상 ~ 52.5% 미만", C: "40% 이상 ~ 47.5% 미만", D: "40% 미만" } as const;

export function DestructionScoreTable({ destruction }: { destruction: DestructionPublicDto }) {
  const classic = destruction.gameMode === "CLASSIC";
  const classicPlayers = classic ? [
    ...destruction.teams.flatMap((team) => team.rosterPlayers.map((player) => ({ ...player, teamName: team.name }))),
    ...destruction.unassignedPlayers,
  ] : [];
  if (!classic && destruction.ratingPolicy) return <AbsoluteScoreTable destruction={destruction} />;
  return <section className={styles.workspace} aria-labelledby="score-table-title">
    <section className={styles.panel}>
      <h2 id="score-table-title">{DESTRUCTION_GAME_MODES[destruction.gameMode]} 멸망전 점수표</h2>
      {classic ? <>
        <p>주장 시작 포인트 = 2,000P − 티어·포지션 기준 가치 × 10 · 10P 단위 반올림</p>
        <p>마스터 이상: LP 구간 적용 · 실버 3 이하: 실버 4·브론즈·아이언 포함 · 티어 미확인: 운영자 확인 필요</p>
        <p>기준 가치: 운영자 최종 확정</p>
        <div className={`${styles.tableWrap} ${styles.classicPointTable}`} role="region" aria-label="협곡 티어·포지션별 주장 시작 포인트" tabIndex={0}>
          <table><caption>티어·포지션별 주장 시작 포인트</caption>
            <thead><tr><th scope="col">티어 / LP</th>{COMPETITION_POSITIONS.map((position) => <th scope="col" key={position}>{competitionPositionLabel(position)}</th>)}</tr></thead>
            <tbody>{CLASSIC_CAPTAIN_POINT_TABLE.map((row) => <tr key={row.tierLabel}><th scope="row">{row.tierLabel}</th>{row.positions.map((entry) => <td key={entry.position}>{entry.captainPoints.toLocaleString("ko-KR")}P</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p>최소 낙찰가 1P · 주장 확정 시 4명 충원용 최소 4P · 경매 중 남은 자리의 최소 포인트 보존</p>
      </> : <>
        <p>최근 최대 100판 · 대회 경매용 임시 등급 · Riot 공식 티어·MMR 아님</p>
        <div className={styles.tableWrap} role="region" aria-label="등급별 경매 포인트 기준" tabIndex={0}>
          <table><caption>등급별 점수 기준 · 보정 승률 = (승수 + 10) ÷ (판수 + 20)</caption>
            <thead><tr><th scope="col">등급</th><th scope="col">보정 승률</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th></tr></thead>
            <tbody>{(Object.keys(tierRanges) as (keyof typeof tierRanges)[]).map((tier) => <tr key={tier}><th scope="row">{tier}</th><td>{tierRanges[tier]}</td><td>{ARAM_AUCTION_MINIMUM_BIDS[tier]}P</td><td>{(2_000 - ARAM_AUCTION_MINIMUM_BIDS[tier]).toLocaleString("ko-KR")}P</td></tr>)}</tbody>
          </table>
        </div>
        <ul className={styles.blockers}>
          <li>1~19판: 잠정 B등급 · 50판 미만: 표본 부족</li>
          <li>0판·전적 미확인: 등급 없음</li>
          <li>주장 시작 포인트 = 2,000P − 본인 최소 입찰가 · 주장 확정 후 평가 고정</li>
        </ul>
      </>}
    </section>
    {classic ? <>
      <section className={styles.panel}>
        <h2>팀별 확정 포인트</h2>
        {destruction.teams.length ? <div className={styles.tableWrap} role="region" aria-label="협곡 팀별 확정 경매 포인트" tabIndex={0}>
          <table><caption>팀별 실제 경매 포인트</caption>
            <thead><tr><th scope="col">팀</th><th scope="col">주장</th><th scope="col">시작</th><th scope="col">사용</th><th scope="col">잔여</th></tr></thead>
            <tbody>{destruction.teams.map((team) => <tr key={team.id}><th scope="row">{team.name}</th><td>{team.captainPlayerName ?? "선정 전"}</td><td>{team.initialAuctionPoints.toLocaleString("ko-KR")}P</td><td>{(team.initialAuctionPoints - team.remainingAuctionPoints).toLocaleString("ko-KR")}P</td><td>{team.remainingAuctionPoints.toLocaleString("ko-KR")}P</td></tr>)}</tbody>
          </table>
        </div> : <p role="status">주장·팀 미확정</p>}
      </section>
      <section className={styles.panel}>
        <h2>선수별 낙찰 포인트</h2>
        {classicPlayers.length ? <div className={styles.tableWrap} role="region" aria-label="협곡 선수별 낙찰 포인트" tabIndex={0}>
          <table><caption>참가 확정 선수의 실제 낙찰가 · 주장 경매 제외</caption>
            <thead><tr><th scope="col">선수</th><th scope="col">포지션</th><th scope="col">팀</th><th scope="col">낙찰 포인트</th></tr></thead>
            <tbody>{classicPlayers.map((player) => <tr key={player.participantId}><th scope="row">{player.playerName}{player.isCaptain ? " · 주장" : ""}</th><td>{competitionPositionLabel(player.position)}</td><td>{player.teamName}</td><td>{player.isCaptain ? "주장 · 경매 제외" : player.purchasePoints === null ? "경매 대기" : `${player.purchasePoints.toLocaleString("ko-KR")}P`}</td></tr>)}</tbody>
          </table>
        </div> : <p role="status">확정 참가자 없음</p>}
      </section>
    </> : null}
    {!classic ? <section className={styles.panel}>
      <h2>선수별 점수표</h2>
      {destruction.auctionRatings.length ? <div className={styles.tableWrap} role="region" aria-label="선수별 등급과 경매 포인트" tabIndex={0}>
        <table><caption>확인된 전적 기준 · 주장 시작 포인트는 주장 선정 시 적용</caption>
          <thead><tr><th scope="col">선수</th><th scope="col">등급</th><th scope="col">전적</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th><th scope="col">출처</th><th scope="col">표본</th></tr></thead>
          <tbody>{destruction.auctionRatings.map((rating, index) => <tr key={index}>
            <th scope="row">{rating.playerName}</th><td>{rating.tier}{rating.games < 20 ? " (잠정)" : ""}</td><td>{rating.games}판 {rating.wins}승 {rating.losses}패</td>
            <td>{rating.minimumBid}P</td><td>{rating.captainPoints.toLocaleString("ko-KR")}P</td><td>{rating.source === "RIOT" ? "Riot 조회" : "운영자 확인"}</td><td>{rating.provisional ? "표본 부족" : "50판 이상"}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p role="status">평가된 선수 없음</p>}
    </section> : null}
  </section>;
}

function AbsoluteScoreTable({ destruction }: { destruction: DestructionPublicDto }) {
  const policy = destruction.ratingPolicy!;
  return <section className={styles.workspace} aria-labelledby="score-table-title"><section className={styles.panel}>
    <h2 id="score-table-title">{DESTRUCTION_GAME_MODES[destruction.gameMode]} 멸망전 절대평가 점수표</h2>
    <p>총점 = {RATING_KEYS.map((key) => `${ratingLabel(key, policy)} × ${(policy.weights[key] / 100).toFixed(2)}`).join(" + ")}</p>
    <p>항목별 0~100점 · 참가자 순위 무관 · {policy.version}. {policy.version === "ABSOLUTE_V3" ? "해당 모드 판수 = 승수 + 패수 · 판수 / 300 × 100점(최대 100) · 승률 미반영 · 0판: 0점 · 미입력: 평가 대기" : policy.version === "ABSOLUTE_V2" ? "해당 모드 누적 승패: 본인 기재" : "증바람: 일반 칼바람 성과 적용"} · 주장 확정 후 평가 고정</p>
    <p>초기 환산 기준 · 실력 예측력 미검증 · 누락 항목: 0점 대신 평가 대기·가능 점수 범위</p>
    <div className={styles.tableWrap} role="region" aria-label="절대평가 등급별 경매 포인트" tabIndex={0}><table><caption>절대평가 등급과 경매 기준</caption>
      <thead><tr><th scope="col">등급</th><th scope="col">총점 하한</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th></tr></thead>
      <tbody>{(Object.keys(ABSOLUTE_TIER_FLOORS) as (keyof typeof ABSOLUTE_TIER_FLOORS)[]).map((tier) => <tr key={tier}><th scope="row">{tier}</th><td>{ABSOLUTE_TIER_FLOORS[tier]}점 이상</td><td>{ARAM_AUCTION_MINIMUM_BIDS[tier]}P</td><td>{2_000 - ARAM_AUCTION_MINIMUM_BIDS[tier]}P</td></tr>)}</tbody>
    </table></div>
  </section><section className={styles.panel}><h2>선수별 항목 점수</h2>
    {destruction.absoluteRatings?.length ? <div className={styles.tableWrap} role="region" aria-label="선수별 절대평가 항목과 등급" tabIndex={0}><table>
      <caption>반영 비중·원점수·자료 출처</caption>
      <thead><tr><th scope="col">선수</th>{RATING_KEYS.map((key) => <th scope="col" key={key}>{ratingLabel(key, policy)} {policy.weights[key]}%</th>)}<th scope="col">총점</th><th scope="col">등급</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th></tr></thead>
      <tbody>{destruction.absoluteRatings.map((rating, index) => <tr key={index}><th scope="row">{rating.playerName}</th>{rating.components.map((component) => <td key={component.key}>{policy.weights[component.key] === 0 ? "제외" : component.score === null ? component.status === "ERROR" ? "조회 오류" : "자료 대기" : `${component.score.toFixed(2)}${component.source === "SELF_REPORTED" ? " (본인 기재)" : component.source === "ADMIN_VERIFIED" ? " (확인)" : ""}`}</td>)}<td>{rating.score === null ? `${rating.minimum.toFixed(2)}~${rating.maximum.toFixed(2)}` : rating.score.toFixed(2)}</td><td>{rating.tier ?? "평가 대기"}</td><td>{rating.minimumBid === null ? "—" : `${rating.minimumBid}P`}</td><td>{rating.captainPoints === null ? "—" : `${rating.captainPoints}P`}</td></tr>)}</tbody>
    </table></div> : <p role="status">평가 대기 · 참가 확정 후 자동 평가</p>}
  </section></section>;
}
