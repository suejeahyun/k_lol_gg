import { ARAM_AUCTION_MINIMUM_BIDS, DESTRUCTION_GAME_MODES } from "@/modules/competitions/destruction/aram-rating";
import { CLASSIC_CAPTAIN_POINT_TABLE } from "@/modules/competitions/destruction/classic-point-table";
import { COMPETITION_POSITIONS, competitionPositionLabel } from "@/modules/competitions/core";
import type { DestructionPublicDto } from "@/modules/competitions/destruction/state";
import styles from "./workspace.module.css";
import { ABSOLUTE_TIER_FLOORS, RATING_KEYS, RATING_LABELS } from "@/modules/competitions/destruction/provisional-rating";

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
        <p>티어와 참가 포지션에 따른 주장 시작 포인트 기준표입니다. 2,000P에서 티어·포지션 기준 가치의 10배를 뺀 뒤 10P 단위로 반올림합니다.</p>
        <p>마스터·그랜드마스터·챌린저는 LP 구간을 함께 사용합니다. 실버 3 이하에는 실버 4·브론즈·아이언이 포함됩니다. 티어 미확인 선수는 운영자 확인이 필요합니다.</p>
        <p>운영자가 기준 가치를 입력해 최종 확정합니다. 실제 확정 포인트는 아래 팀별 표에서 확인하세요.</p>
        <div className={`${styles.tableWrap} ${styles.classicPointTable}`} role="region" aria-label="협곡 티어·포지션별 주장 시작 포인트" tabIndex={0}>
          <table><caption>티어·포지션별 주장 시작 포인트 · 모바일에서는 표를 좌우로 밀어 확인하세요.</caption>
            <thead><tr><th scope="col">티어 / LP</th>{COMPETITION_POSITIONS.map((position) => <th scope="col" key={position}>{competitionPositionLabel(position)}</th>)}</tr></thead>
            <tbody>{CLASSIC_CAPTAIN_POINT_TABLE.map((row) => <tr key={row.tierLabel}><th scope="row">{row.tierLabel}</th>{row.positions.map((entry) => <td key={entry.position}>{entry.captainPoints.toLocaleString("ko-KR")}P</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p>선수 최소 낙찰가는 1P입니다. 주장 확정 시 선수 4명을 충원할 최소 4P가 필요하며, 경매 중에도 남은 자리의 최소 포인트를 보존합니다.</p>
      </> : <>
        <p>최근 최대 100판으로 계산하는 대회 경매용 임시 등급입니다. Riot 공식 티어·MMR이 아닙니다.</p>
        <div className={styles.tableWrap} role="region" aria-label="등급별 경매 포인트 기준" tabIndex={0}>
          <table><caption>등급별 점수 기준 · 보정 승률 = (승수 + 10) ÷ (판수 + 20)</caption>
            <thead><tr><th scope="col">등급</th><th scope="col">보정 승률</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th></tr></thead>
            <tbody>{(Object.keys(tierRanges) as (keyof typeof tierRanges)[]).map((tier) => <tr key={tier}><th scope="row">{tier}</th><td>{tierRanges[tier]}</td><td>{ARAM_AUCTION_MINIMUM_BIDS[tier]}P</td><td>{(2_000 - ARAM_AUCTION_MINIMUM_BIDS[tier]).toLocaleString("ko-KR")}P</td></tr>)}</tbody>
          </table>
        </div>
        <ul className={styles.blockers}>
          <li>1~19판은 승률에 관계없이 잠정 B등급이며, 50판 미만은 표본 부족으로 표시합니다.</li>
          <li>0판이거나 전적을 확인하지 못한 선수는 등급을 부여하지 않습니다.</li>
          <li>주장 시작 포인트는 2,000P에서 본인 최소 입찰가를 뺀 값입니다. 주장 확정 이후 평가는 고정됩니다.</li>
        </ul>
      </>}
    </section>
    {classic ? <>
      <section className={styles.panel}>
        <h2>팀별 확정 포인트</h2>
        {destruction.teams.length ? <div className={styles.tableWrap} role="region" aria-label="협곡 팀별 확정 경매 포인트" tabIndex={0}>
          <table><caption>대회에 저장된 실제 시작·사용·잔여 포인트</caption>
            <thead><tr><th scope="col">팀</th><th scope="col">주장</th><th scope="col">시작</th><th scope="col">사용</th><th scope="col">잔여</th></tr></thead>
            <tbody>{destruction.teams.map((team) => <tr key={team.id}><th scope="row">{team.name}</th><td>{team.captainPlayerName ?? "선정 전"}</td><td>{team.initialAuctionPoints.toLocaleString("ko-KR")}P</td><td>{(team.initialAuctionPoints - team.remainingAuctionPoints).toLocaleString("ko-KR")}P</td><td>{team.remainingAuctionPoints.toLocaleString("ko-KR")}P</td></tr>)}</tbody>
          </table>
        </div> : <p role="status">주장과 팀이 확정되면 실제 경매 포인트가 표시됩니다.</p>}
      </section>
      <section className={styles.panel}>
        <h2>선수별 낙찰 포인트</h2>
        {classicPlayers.length ? <div className={styles.tableWrap} role="region" aria-label="협곡 선수별 낙찰 포인트" tabIndex={0}>
          <table><caption>참가 확정 선수의 팀·포지션·실제 낙찰가 · 주장은 경매 대상에서 제외됩니다.</caption>
            <thead><tr><th scope="col">선수</th><th scope="col">포지션</th><th scope="col">팀</th><th scope="col">낙찰 포인트</th></tr></thead>
            <tbody>{classicPlayers.map((player) => <tr key={player.participantId}><th scope="row">{player.playerName}{player.isCaptain ? " · 주장" : ""}</th><td>{competitionPositionLabel(player.position)}</td><td>{player.teamName}</td><td>{player.isCaptain ? "주장 · 경매 제외" : player.purchasePoints === null ? "경매 대기" : `${player.purchasePoints.toLocaleString("ko-KR")}P`}</td></tr>)}</tbody>
          </table>
        </div> : <p role="status">참가자가 확정되면 선수별 낙찰 포인트가 표시됩니다.</p>}
      </section>
    </> : null}
    {!classic ? <section className={styles.panel}>
      <h2>선수별 점수표</h2>
      {destruction.auctionRatings.length ? <div className={styles.tableWrap} role="region" aria-label="선수별 등급과 경매 포인트" tabIndex={0}>
        <table><caption>확인된 전적 기준 · 주장 시작 포인트는 해당 선수가 주장일 때 적용됩니다.</caption>
          <thead><tr><th scope="col">선수</th><th scope="col">등급</th><th scope="col">전적</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th><th scope="col">출처</th><th scope="col">표본</th></tr></thead>
          <tbody>{destruction.auctionRatings.map((rating, index) => <tr key={index}>
            <th scope="row">{rating.playerName}</th><td>{rating.tier}{rating.games < 20 ? " (잠정)" : ""}</td><td>{rating.games}판 {rating.wins}승 {rating.losses}패</td>
            <td>{rating.minimumBid}P</td><td>{rating.captainPoints.toLocaleString("ko-KR")}P</td><td>{rating.source === "RIOT" ? "Riot 조회" : "운영자 확인"}</td><td>{rating.provisional ? "표본 부족" : "50판 이상"}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p role="status">아직 평가된 선수가 없습니다. 전적 확인이 완료되면 선수별 등급과 포인트가 표시됩니다.</p>}
    </section> : null}
  </section>;
}

function AbsoluteScoreTable({ destruction }: { destruction: DestructionPublicDto }) {
  const policy = destruction.ratingPolicy!;
  return <section className={styles.workspace} aria-labelledby="score-table-title"><section className={styles.panel}>
    <h2 id="score-table-title">{DESTRUCTION_GAME_MODES[destruction.gameMode]} 멸망전 절대평가 점수표</h2>
    <p>총점 = {RATING_KEYS.map((key) => `${RATING_LABELS[key]} × ${(policy.weights[key] / 100).toFixed(2)}`).join(" + ")}</p>
    <p>각 항목 0~100점 · 참가자 순위와 무관한 고정 기준 · {policy.version}. 증바람도 일반 칼바람 성과를 사용합니다. 주장 확정 후 평가가 고정됩니다.</p>
    <p>초기 환산 기준이며 실력 예측력이 검증된 공식은 아닙니다. 누락 항목은 0점으로 처리하지 않고 평가 대기와 가능한 점수 범위를 표시합니다.</p>
    <div className={styles.tableWrap} role="region" aria-label="절대평가 등급별 경매 포인트" tabIndex={0}><table><caption>절대평가 등급과 경매 기준</caption>
      <thead><tr><th scope="col">등급</th><th scope="col">총점 하한</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th></tr></thead>
      <tbody>{(Object.keys(ABSOLUTE_TIER_FLOORS) as (keyof typeof ABSOLUTE_TIER_FLOORS)[]).map((tier) => <tr key={tier}><th scope="row">{tier}</th><td>{ABSOLUTE_TIER_FLOORS[tier]}점 이상</td><td>{ARAM_AUCTION_MINIMUM_BIDS[tier]}P</td><td>{2_000 - ARAM_AUCTION_MINIMUM_BIDS[tier]}P</td></tr>)}</tbody>
    </table></div>
  </section><section className={styles.panel}><h2>선수별 항목 점수</h2>
    {destruction.absoluteRatings?.length ? <div className={styles.tableWrap} role="region" aria-label="선수별 절대평가 항목과 등급" tabIndex={0}><table>
      <caption>반영 비중과 원점수 · 운영자 보완 자료는 별도 표시</caption>
      <thead><tr><th scope="col">선수</th>{RATING_KEYS.map((key) => <th scope="col" key={key}>{RATING_LABELS[key]} {policy.weights[key]}%</th>)}<th scope="col">총점</th><th scope="col">등급</th><th scope="col">최소 입찰가</th><th scope="col">주장 시작 포인트</th></tr></thead>
      <tbody>{destruction.absoluteRatings.map((rating, index) => <tr key={index}><th scope="row">{rating.playerName}</th>{rating.components.map((component) => <td key={component.key}>{policy.weights[component.key] === 0 ? "제외" : component.score === null ? component.status === "ERROR" ? "조회 오류" : "자료 대기" : `${component.score.toFixed(2)}${component.source === "ADMIN_VERIFIED" ? " (확인)" : ""}`}</td>)}<td>{rating.score === null ? `${rating.minimum.toFixed(2)}~${rating.maximum.toFixed(2)}` : rating.score.toFixed(2)}</td><td>{rating.tier ?? "평가 대기"}</td><td>{rating.minimumBid === null ? "—" : `${rating.minimumBid}P`}</td><td>{rating.captainPoints === null ? "—" : `${rating.captainPoints}P`}</td></tr>)}</tbody>
    </table></div> : <p role="status">참가 확정 후 자동 평가를 시작합니다.</p>}
  </section></section>;
}
