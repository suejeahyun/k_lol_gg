export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { buildOperationAiAddonDashboard } from "@/lib/operation-ai/addons/analytics";

function severityLabel(value: string) {
  if (value === "HIGH") return "높음";
  if (value === "MEDIUM") return "중간";
  return "낮음";
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "danger" | "warning" | "good" | "neutral" }) {
  return <span className={`operation-ai-addon-badge operation-ai-addon-badge--${tone}`}>{children}</span>;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="operation-ai-addon-card">
      <div className="operation-ai-addon-card__head">
        <div>
          <h2>{title}</h2>
          {desc ? <p>{desc}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function OperationAiAddonsPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/admin/login");

  const data = await buildOperationAiAddonDashboard();
  const riskTone = data.risk.level === "HIGH" ? "danger" : data.risk.level === "MEDIUM" ? "warning" : "good";

  return (
    <main className="operation-ai-page operation-ai-addon-page">
      <section className="operation-ai-hero">
        <div>
          <p className="admin-eyebrow">OPERATION AI ADD-ONS</p>
          <h1>운영 AI 확장 대시보드</h1>
          <p>
            기존 참가 분석, 결과 분석, 팀 밸런스 AI를 제외하고 운영 리스크, 노쇼 예측, 자동 공지, 시즌 리포트,
            데이터 감지, 유저 태그, 신규 유저 임시 평가를 한 화면에서 확인합니다.
          </p>
        </div>
        <div className="operation-ai-hero__meta">
          <span>오늘 참가</span>
          <strong>{data.today.activeApplyCount}</strong>
          <small>{data.today.dateKey} 기준</small>
        </div>
      </section>

      <div className="operation-ai-addon-grid operation-ai-addon-grid--stats">
        <div className="operation-ai-addon-stat">
          <span>운영 리스크</span>
          <strong>{severityLabel(data.risk.level)}</strong>
          <Badge tone={riskTone}>{data.risk.score}점</Badge>
        </div>
        <div className="operation-ai-addon-stat">
          <span>추천 운영</span>
          <strong>{data.operationMode.mode}</strong>
          <small>{data.operationMode.reason}</small>
        </div>
        <div className="operation-ai-addon-stat">
          <span>예비 인원 권장</span>
          <strong>{data.noShow.spareCountRecommendation}명</strong>
          <small>취소/노쇼 위험 기반</small>
        </div>
        <div className="operation-ai-addon-stat">
          <span>데이터 점검</span>
          <strong>{data.dataAudit.dangerCount} 위험</strong>
          <small>주의 {data.dataAudit.warningCount}건</small>
        </div>
      </div>

      <Section title="1안. 운영 리스크 대시보드" desc="오늘 내전이 정상 운영 가능한지 자동 판단합니다.">
        <div className="operation-ai-addon-list">
          {data.risk.issues.length === 0 ? <p className="operation-ai-addon-empty">큰 리스크가 없습니다.</p> : null}
          {data.risk.issues.map((issue, index) => (
            <article key={`${issue.title}-${index}`} className="operation-ai-addon-issue">
              <Badge tone={issue.severity === "HIGH" ? "danger" : issue.severity === "MEDIUM" ? "warning" : "neutral"}>{severityLabel(issue.severity)}</Badge>
              <div>
                <strong>{issue.title}</strong>
                <p>{issue.description}</p>
                {issue.suggestion ? <small>{issue.suggestion}</small> : null}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="2안. 노쇼·취소 위험 예측" desc="최근 신청/취소/실제 경기 기록으로 참가 안정성을 봅니다.">
        <div className="operation-ai-addon-table-wrap">
          <table className="operation-ai-addon-table">
            <thead><tr><th>플레이어</th><th>신청</th><th>취소</th><th>경기기록</th><th>위험</th><th>근거</th></tr></thead>
            <tbody>
              {data.noShow.riskyPlayers.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.name} <small>{row.nickname}#{row.tag}</small></td>
                  <td>{row.applied}</td>
                  <td>{row.cancelled}</td>
                  <td>{row.playedAfterApply}</td>
                  <td>{row.riskScore}</td>
                  <td>{row.reasons.join(" / ") || "데이터 부족"}</td>
                </tr>
              ))}
              {data.noShow.riskyPlayers.length === 0 ? <tr><td colSpan={6}>위험 참가자가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="3안. AI 공지 생성기" desc="휴대폰 카카오 자동화가 시간대별로 호출할 수 있는 문구입니다.">
        <div className="operation-ai-addon-notices">
          {data.noticeSamples.map((notice) => (
            <article key={notice.type}>
              <h3>{notice.title}</h3>
              <pre>{notice.text}</pre>
            </article>
          ))}
        </div>
        <div className="operation-ai-addon-code">
          <strong>자동 호출 API</strong>
          <code>GET /api/kakao/scheduled-notice?slot=12</code>
          <code>GET /api/kakao/scheduled-notice?slot=15</code>
          <code>GET /api/kakao/scheduled-notice?slot=18</code>
          <code>GET /api/kakao/scheduled-notice?slot=20</code>
        </div>
      </Section>

      <Section title="4안. 시즌 운영 리포트" desc="시즌 누적 경기 흐름을 요약합니다.">
        <div className="operation-ai-addon-grid">
          <div><strong>{data.seasonReport.totalSeries}</strong><span>매치 시리즈</span></div>
          <div><strong>{data.seasonReport.totalGames}</strong><span>총 세트</span></div>
          <div><strong>{data.seasonReport.redWins}</strong><span>RED 승</span></div>
          <div><strong>{data.seasonReport.blueWins}</strong><span>BLUE 승</span></div>
        </div>
        <ul className="operation-ai-addon-ul">
          {data.seasonReport.notes.map((note) => <li key={note}>{note}</li>)}
          {data.seasonReport.notes.length === 0 ? <li>시즌 데이터가 아직 부족합니다.</li> : null}
        </ul>
      </Section>

      <Section title="5안. 이상 데이터 감지" desc="수동 입력과 이미지 분석 결과에서 통계 오염 가능성을 찾습니다.">
        <div className="operation-ai-addon-list">
          {data.dataAudit.issues.map((issue, index) => (
            <article key={`${issue.title}-${index}`} className="operation-ai-addon-issue">
              <Badge tone={issue.severity === "HIGH" ? "danger" : "warning"}>{severityLabel(issue.severity)}</Badge>
              <div><strong>{issue.title}</strong><p>{issue.description}</p><small>{issue.suggestion}</small></div>
            </article>
          ))}
          {data.dataAudit.issues.length === 0 ? <p className="operation-ai-addon-empty">최근 경기 데이터 이상 징후가 없습니다.</p> : null}
        </div>
      </Section>

      <Section title="6안. 참가자 자동 분류 태그" desc="오늘 참가자를 운영 관점 태그로 분류합니다.">
        <div className="operation-ai-addon-tags">
          {data.playerTags.map((row) => (
            <article key={row.playerId}>
              <strong>{row.name}</strong>
              <small>{row.nickname}#{row.tag}</small>
              <div>{row.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
              <p>{row.reasons.join(" / ")}</p>
            </article>
          ))}
          {data.playerTags.length === 0 ? <p className="operation-ai-addon-empty">오늘 참가자가 없습니다.</p> : null}
        </div>
      </Section>

      <Section title="7안. 오늘 가능한 운영 방식 자동 추천" desc="현재 인원 기준으로 적절한 운영 방식을 제안합니다.">
        <div className="operation-ai-addon-callout">
          <strong>{data.operationMode.mode}</strong>
          <p>{data.operationMode.reason}</p>
          {data.operationMode.warnings.map((warning) => <small key={warning}>{warning}</small>)}
        </div>
      </Section>

      <Section title="8안. 팀 발표 카드 생성 준비" desc="현재는 이미지 생성 전 단계로 카카오 복사용 팀 발표 문구 API를 제공합니다.">
        <p className="operation-ai-addon-empty">
          팀 밸런스 확정 데이터와 연결하면 RED/BLUE 카드 이미지 생성까지 확장 가능합니다. 현재 패치에는 공지 문구 자동 생성과 복사용 API를 먼저 포함했습니다.
        </p>
      </Section>

      <Section title="9안. 밸런스 실패 원인 자동 학습" desc="AI 예측과 실제 승리팀이 다른 리뷰를 분류합니다.">
        <div className="operation-ai-addon-grid">
          <div><strong>{data.balanceFailureLearning.totalReviews}</strong><span>검토 리뷰</span></div>
          <div><strong>{data.balanceFailureLearning.failedPredictionCount}</strong><span>예측 실패</span></div>
        </div>
        <div className="operation-ai-addon-list">
          {data.balanceFailureLearning.patterns.map((pattern) => (
            <article key={pattern.title} className="operation-ai-addon-issue">
              <Badge tone={pattern.count > 0 ? "warning" : "neutral"}>{pattern.count}건</Badge>
              <div><strong>{pattern.title}</strong><p>{pattern.description}</p></div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="10안. 챔피언 숙련도 기반 보정" desc="선수·챔피언 조합별 시즌 기록을 밸런스 참고 데이터로 보여줍니다.">
        <div className="operation-ai-addon-table-wrap">
          <table className="operation-ai-addon-table">
            <thead><tr><th>플레이어</th><th>챔피언</th><th>경기</th><th>승</th><th>승률</th><th>MVP</th></tr></thead>
            <tbody>
              {data.championMastery.map((row) => (
                <tr key={`${row.playerId}-${row.championName}`}>
                  <td>{row.playerName}</td><td>{row.championName}</td><td>{row.games}</td><td>{row.wins}</td><td>{row.winRate}%</td><td>{row.mvpCount}</td>
                </tr>
              ))}
              {data.championMastery.length === 0 ? <tr><td colSpan={6}>챔피언 숙련도 데이터가 부족합니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="11안. 운영자 수정 우선순위" desc="오늘 먼저 확인해야 할 항목만 모읍니다.">
        <div className="operation-ai-addon-list">
          {data.todoPriority.map((issue, index) => (
            <article key={`${issue.title}-${index}`} className="operation-ai-addon-issue">
              <Badge tone={issue.severity === "HIGH" ? "danger" : "warning"}>{index + 1}</Badge>
              <div><strong>{issue.title}</strong><p>{issue.description}</p><small>{issue.suggestion}</small></div>
            </article>
          ))}
          {data.todoPriority.length === 0 ? <p className="operation-ai-addon-empty">즉시 수정해야 할 우선 항목이 없습니다.</p> : null}
        </div>
      </Section>

      <Section title="12안. 신규 유저 실력 추정 모드" desc="데이터 부족 참가자의 임시 점수와 신뢰도를 보여줍니다.">
        <div className="operation-ai-addon-table-wrap">
          <table className="operation-ai-addon-table">
            <thead><tr><th>플레이어</th><th>닉네임</th><th>임시 점수</th><th>불확실성</th><th>근거</th></tr></thead>
            <tbody>
              {data.newPlayerEstimates.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.name}</td><td>{row.nickname}</td><td>{row.provisionalScore}</td><td>{severityLabel(row.confidence)}</td><td>{row.reason}</td>
                </tr>
              ))}
              {data.newPlayerEstimates.length === 0 ? <tr><td colSpan={5}>신규/저데이터 참가자가 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}
