"use client";
import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";

import Link from "next/link";
import { attendanceStatusLabel, formatDate, matchTypeLabel, useDiscordOverview } from "../_DiscordClientUtils";

export default function DiscordMatchPage() {
  const { data, loading, load } = useDiscordOverview();
  const match = data?.matchAttendance;
  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div><h1 className="admin-page__title">내전 Discord 모임 확인</h1></div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="matches" />
      <section className="discord-ops-stat-grid">
        <div className="discord-ops-stat"><span>참가</span><strong>{match?.totalCount ?? 0}명</strong><em>오늘 내전</em></div>
        <div className="discord-ops-stat"><span>확인</span><strong>{match?.presentCount ?? 0}명</strong><em>Discord 입장 확인</em></div>
        <div className="discord-ops-stat"><span>늦참</span><strong>{match?.lateCount ?? 0}명</strong><em>{match?.requiredArrivalText ? `${match.requiredArrivalText} 이후` : "시작 10분 전 이후"}</em></div>
        <div className="discord-ops-stat"><span>미접속 경고</span><strong>{match?.absentWarningCount ?? 0}명</strong><em>{match?.absentAfterText ? `${match.absentAfterText} 이후 미확인` : "시작 10분 후 미확인"}</em></div>
        <div className="discord-ops-stat"><span>내전 시간</span><strong>{match?.matchStartText || "20:00"}</strong><em>카카오톡 공지 시간 기준</em></div>
        <div className="discord-ops-stat"><span>도착 기준</span><strong>{match?.requiredArrivalText || "19:50"}</strong><em>시작 10분 전</em></div>
      </section>
      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><h2>참가자별 확인</h2></div>
        {loading || !data || !match ? <div className="admin-empty">불러오는 중입니다.</div> : <div className="admin-table-wrap discord-table-scroll"><table className="admin-table discord-compact-table"><thead><tr><th className="col-main">참가자</th><th className="col-status">상태</th><th className="col-medium">확인 방식</th><th className="col-wide">Discord</th><th className="col-wide">음성방</th><th className="col-medium">입장</th></tr></thead><tbody>
          {match.players.length === 0 ? <tr><td colSpan={6}>오늘 내전 참가자가 없습니다.</td></tr> : match.players.map((player) => <tr key={player.applyId}>
            <td>{player.name}<br /><span className="admin-muted">{player.nickname}#{player.tag}</span></td>
            <td><span className={`discord-status-pill discord-status-${player.attendanceStatus.toLowerCase().replaceAll("_", "-")}`}>{attendanceStatusLabel(player.attendanceStatus)}</span></td>
            <td>{matchTypeLabel(player.matchType)}</td>
            <td>{player.matchedDisplayName || "-"}</td>
            <td>{player.channelName || "-"}</td>
            <td>{formatDate(player.joinedAt)}</td>
          </tr>)}
        </tbody></table></div>}
        {match?.extraVoiceUsers?.length ? <div className="discord-extra-users-box">
          <strong>참가 신청 없이 내전 음성방에 있는 유저</strong>
          <div className="discord-extra-user-chips">
            {match.extraVoiceUsers.slice(0, 12).map((user) => <span key={`${user.discordId}-${user.channelName || ""}`}>{user.displayName}{user.channelName ? ` · ${user.channelName}` : ""}</span>)}
          </div>
        </div> : null}
      </section>
    </main>
  );
}