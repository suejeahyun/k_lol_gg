"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  useMemo,
  useState,
} from "react";

type Candidate = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
  score: number;
  reason: string;
};

type ChampionCandidate = {
  id: number;
  name: string;
  imageUrl: string;
  score: number;
  reason: string;
};

type ParsedRow = {
  rowId: string;
  order: number;
  rawLine: string;
  name: string;
  currentTier: string | null;
  peakTier: string | null;
  mainPosition: string | null;
  subPositions: string[];
  selectedPlayerId: number | null;
  candidates: Candidate[];
  warnings: string[];
};

type ParseResult = {
  requestId: number;
  total: number;
  rows: ParsedRow[];
  extractedText?: string;
  notes?: string[];
};

type ConfirmResult = {
  confirmedCount: number;
  skippedCount: number;
  confirmed: Array<{ playerId: number; name: string; createdPlayer: boolean }>;
  skipped: Array<{ name: string; reason: string }>;
};

type MatchResultParticipant = {
  rowId: string;
  name: string;
  champion: string | null;
  team: "BLUE" | "RED" | null;
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  rawText?: string | null;
  confidence?: number | null;
  selectedPlayerId: number | null;
  selectedChampionId: number | null;
  playerCandidates: Candidate[];
  championCandidates: ChampionCandidate[];
  warnings: string[];
};

type MatchResultGame = {
  gameNumber: number;
  winnerTeam: "BLUE" | "RED" | null;
  participants: MatchResultParticipant[];
  warnings?: string[];
};

type MatchResultAnalyzeResult = {
  requestId: number;
  activeSeason?: { id: number; name: string } | null;
  titleHint: string | null;
  matchDateHint: string | null;
  rawText?: string | null;
  warnings: string[];
  notes?: string[];
  games: MatchResultGame[];
};

type MatchCreateResult = {
  matchId: number;
  title: string;
  gameCount: number;
};

type AnalyzeMode =
  | "PARTICIPATION_TEXT"
  | "PARTICIPATION_IMAGE"
  | "MATCH_RESULT_IMAGE"
  | "MATCH_RESULT_TEXT";

const sampleText = ``;

const teamOptions = ["BLUE", "RED"] as const;
const positionOptions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

const sampleMatchResultText = ``;

function todayDateInputValue() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function nowDateTimeInputValue() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function defaultMatchTitle() {
  const date = todayDateInputValue().slice(5).replace("-", "월 ");
  return `${date}일 1차 내전`;
}

function getMatchResultBlockingIssues(games: MatchResultGame[]) {
  const issues: string[] = [];

  for (const game of games) {
    const label = `${game.gameNumber}세트`;

    if (game.winnerTeam !== "BLUE" && game.winnerTeam !== "RED") {
      issues.push(`${label}: 승리팀을 선택해야 합니다.`);
    }

    if (game.participants.length !== 10) {
      issues.push(
        `${label}: 참가자는 정확히 10명이어야 합니다. 현재 ${game.participants.length}명입니다.`,
      );
    }

    const bluePositions = new Set<string>();
    const redPositions = new Set<string>();
    const playerIds: number[] = [];
    const championIds: number[] = [];

    game.participants.forEach((participant, index) => {
      const rowLabel = `${label} ${index + 1}번`;

      if (!participant.selectedPlayerId) {
        issues.push(
          `${rowLabel}: 선수 DB 매칭이 필요합니다. (${participant.name || "이름 없음"})`,
        );
      } else {
        playerIds.push(participant.selectedPlayerId);
      }

      if (!participant.selectedChampionId) {
        issues.push(
          `${rowLabel}: 챔피언 DB 매칭이 필요합니다. (${participant.champion || "챔피언 없음"})`,
        );
      } else {
        championIds.push(participant.selectedChampionId);
      }

      if (participant.team !== "BLUE" && participant.team !== "RED") {
        issues.push(`${rowLabel}: 팀을 선택해야 합니다.`);
      }

      if (!participant.position) {
        issues.push(`${rowLabel}: 포지션을 선택해야 합니다.`);
      }

      if (
        participant.kills === null ||
        participant.deaths === null ||
        participant.assists === null
      ) {
        issues.push(`${rowLabel}: K/D/A를 모두 입력해야 합니다.`);
      }

      if (participant.team === "BLUE" && participant.position) {
        bluePositions.add(participant.position);
      }

      if (participant.team === "RED" && participant.position) {
        redPositions.add(participant.position);
      }
    });

    if (playerIds.length !== new Set(playerIds).size) {
      issues.push(`${label}: 중복 선택된 선수가 있습니다.`);
    }

    if (championIds.length !== new Set(championIds).size) {
      issues.push(`${label}: 중복 선택된 챔피언이 있습니다.`);
    }

    for (const position of positionOptions) {
      if (!bluePositions.has(position)) {
        issues.push(`${label}: BLUE팀에 ${position} 포지션이 없습니다.`);
      }

      if (!redPositions.has(position)) {
        issues.push(`${label}: RED팀에 ${position} 포지션이 없습니다.`);
      }
    }
  }

  return Array.from(new Set(issues));
}

function formatBlockingIssues(issues: string[]) {
  if (issues.length === 0) return "";

  const visible = issues.slice(0, 12);
  const hiddenCount = issues.length - visible.length;

  return [
    "내전 등록 전 확인이 필요합니다.",
    ...visible.map((issue) => `- ${issue}`),
    hiddenCount > 0 ? `- 외 ${hiddenCount}건` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getStatusLabel(row: ParsedRow) {
  if (row.warnings.length > 0) return "확인 필요";
  if (!row.selectedPlayerId) return "매칭 필요";
  return "등록 가능";
}

function getResultRowStatus(row: MatchResultParticipant) {
  if (row.warnings.length > 0) return "확인 필요";
  if (!row.selectedPlayerId || !row.selectedChampionId) return "매칭 필요";
  if (
    !row.team ||
    !row.position ||
    row.kills === null ||
    row.deaths === null ||
    row.assists === null
  ) {
    return "입력 필요";
  }
  return "등록 가능";
}

function toNullableNumber(value: string) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

export default function OperationAiPage() {
  const [mode, setMode] = useState<AnalyzeMode>("PARTICIPATION_TEXT");
  const [text, setText] = useState(sampleText);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageSourceLabel, setImageSourceLabel] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState(
    "참가 신청 캡쳐를 읽어서 참가자 목록을 인식해줘.",
  );
  const [applyDate, setApplyDate] = useState(todayDateInputValue());
  const [createMissingPlayers, setCreateMissingPlayers] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(
    null,
  );

  const [matchPrompt, setMatchPrompt] = useState(
    "이 내전 결과 캡쳐를 읽어서 선수, 챔피언, K/D/A, 승리팀을 인식해줘.",
  );
  const [matchText, setMatchText] = useState(sampleMatchResultText);
  const [matchTitle, setMatchTitle] = useState(defaultMatchTitle());
  const [matchDate, setMatchDate] = useState(nowDateTimeInputValue());
  const [matchSeasonId, setMatchSeasonId] = useState<number | null>(null);
  const [matchResult, setMatchResult] =
    useState<MatchResultAnalyzeResult | null>(null);
  const [matchGames, setMatchGames] = useState<MatchResultGame[]>([]);
  const [matchCreateResult, setMatchCreateResult] =
    useState<MatchCreateResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCount = useMemo(() => rows.length, [rows]);
  const matchedCount = useMemo(
    () =>
      rows.filter((row) => row.selectedPlayerId || createMissingPlayers).length,
    [rows, createMissingPlayers],
  );
  const isMatchMode =
    mode === "MATCH_RESULT_IMAGE" || mode === "MATCH_RESULT_TEXT";

  const matchParticipantCount = useMemo(
    () => matchGames.reduce((sum, game) => sum + game.participants.length, 0),
    [matchGames],
  );
  const matchReadyCount = useMemo(
    () =>
      matchGames.reduce(
        (sum, game) =>
          sum +
          game.participants.filter(
            (row) =>
              row.selectedPlayerId &&
              row.selectedChampionId &&
              row.team &&
              row.position,
          ).length,
        0,
      ),
    [matchGames],
  );

  function resetParticipationResult() {
    setResult(null);
    setRows([]);
    setExtractedText(null);
    setConfirmResult(null);
  }

  function resetMatchResult() {
    setMatchResult(null);
    setMatchGames([]);
    setMatchCreateResult(null);
  }

  function resetAllResults() {
    resetParticipationResult();
    resetMatchResult();
    setMessage(null);
  }

  function setSelectedImageFile(file: File | null, sourceLabel?: string) {
    setImageFile(file);
    setImageSourceLabel(file ? (sourceLabel ?? file.name) : null);
    resetAllResults();

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedImageFile(file, file?.name);
  }

  function handleImagePaste(event: ClipboardEvent<HTMLElement>) {
    if (mode === "PARTICIPATION_TEXT") return;

    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    const pastedFile = imageItem?.getAsFile();

    if (!pastedFile) return;

    event.preventDefault();

    const extension = pastedFile.type.split("/")[1] || "png";
    const file = new File(
      [pastedFile],
      `clipboard-screenshot-${Date.now()}.${extension}`,
      {
        type: pastedFile.type,
      },
    );

    setSelectedImageFile(file, "클립보드 스크린샷");
    setMessage("스크린샷을 붙여넣었습니다. 확인 후 분석 버튼을 누르세요.");
  }

  async function handleAnalyzeText() {
    const response = await fetch(
      "/api/admin/operation-ai/participation/parse",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "시즌 내전 참가 신청 자동 인식",
          text,
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "분석 실패");
    }

    return data as ParseResult;
  }

  async function handleAnalyzeParticipationImage() {
    if (!imageFile) {
      throw new Error("분석할 캡쳐 이미지를 선택해주세요.");
    }

    const formData = new FormData();
    formData.append("prompt", imagePrompt);
    formData.append("image", imageFile);

    const response = await fetch(
      "/api/admin/operation-ai/participation/analyze-image",
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "이미지 분석 실패");
    }

    return data as ParseResult;
  }

  async function handleAnalyzeMatchResultText() {
    const response = await fetch(
      "/api/admin/operation-ai/match-result/parse-text",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "ChatGPT 분석 결과 또는 내전 결과 빠른 입력",
          text: matchText,
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "내전 결과 텍스트 분석 실패");
    }

    return data as MatchResultAnalyzeResult;
  }

  async function handleAnalyzeMatchResultImage() {
    if (!imageFile) {
      throw new Error("분석할 내전 결과 캡쳐 이미지를 선택해주세요.");
    }

    const formData = new FormData();
    formData.append("prompt", matchPrompt);
    formData.append("image", imageFile);

    const response = await fetch(
      "/api/admin/operation-ai/match-result/analyze-image",
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "내전 결과 이미지 분석 실패");
    }

    return data as MatchResultAnalyzeResult;
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setConfirmResult(null);
    setMatchCreateResult(null);

    try {
      if (mode === "MATCH_RESULT_IMAGE" || mode === "MATCH_RESULT_TEXT") {
        const data =
          mode === "MATCH_RESULT_IMAGE"
            ? await handleAnalyzeMatchResultImage()
            : await handleAnalyzeMatchResultText();
        setMatchResult(data);
        setMatchGames(data.games ?? []);
        setExtractedText(data.rawText ?? null);
        setMatchSeasonId(data.activeSeason?.id ?? null);
        if (data.titleHint) setMatchTitle(data.titleHint);
        if (
          data.matchDateHint &&
          /^\d{4}-\d{2}-\d{2}/.test(data.matchDateHint)
        ) {
          setMatchDate(
            `${data.matchDateHint.slice(0, 10)}T${matchDate.slice(11, 16)}`,
          );
        }
        setMessage(
          `${data.games.length}개 세트를 인식했습니다. 확인 후 내전으로 등록하세요.`,
        );
        return;
      }

      const data =
        mode === "PARTICIPATION_TEXT"
          ? await handleAnalyzeText()
          : await handleAnalyzeParticipationImage();

      setResult(data);
      setRows(data.rows ?? []);
      setExtractedText(data.extractedText ?? null);
      setMessage(
        `${data.total}명을 인식했습니다. 확인 후 참가 신청으로 등록하세요.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateRow(rowId: string, next: Partial<ParsedRow>) {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...next } : row)),
    );
  }

  function updateMatchGame(gameNumber: number, next: Partial<MatchResultGame>) {
    setMatchGames((prev) =>
      prev.map((game) =>
        game.gameNumber === gameNumber ? { ...game, ...next } : game,
      ),
    );
  }

  function updateMatchParticipant(
    gameNumber: number,
    rowId: string,
    next: Partial<MatchResultParticipant>,
  ) {
    setMatchGames((prev) =>
      prev.map((game) =>
        game.gameNumber === gameNumber
          ? {
              ...game,
              participants: game.participants.map((participant) =>
                participant.rowId === rowId
                  ? { ...participant, ...next }
                  : participant,
              ),
            }
          : game,
      ),
    );
  }

  async function handleConfirmParticipation() {
    if (!result) return;
    setConfirming(true);
    setMessage(null);
    setConfirmResult(null);

    try {
      const response = await fetch(
        "/api/admin/operation-ai/participation/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: result.requestId,
            applyDate,
            createMissingPlayers,
            rows: rows.map((row) => ({
              enabled: true,
              name: row.name,
              currentTier: row.currentTier,
              peakTier: row.peakTier,
              mainPosition: row.mainPosition,
              subPositions: row.subPositions,
              selectedPlayerId: row.selectedPlayerId,
            })),
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "참가 등록 실패");
      }

      setConfirmResult(data);
      setMessage(
        `${data.confirmedCount}명 등록 완료, ${data.skippedCount}명 보류`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "참가 등록 중 오류가 발생했습니다.",
      );
    } finally {
      setConfirming(false);
    }
  }

  async function handleConfirmMatchResult() {
    if (!matchResult) return;

    const blockingIssues = getMatchResultBlockingIssues(matchGames);
    if (blockingIssues.length > 0) {
      setMessage(formatBlockingIssues(blockingIssues));
      return;
    }

    setConfirming(true);
    setMessage(null);
    setMatchCreateResult(null);

    try {
      const response = await fetch(
        "/api/admin/operation-ai/match-result/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: matchResult.requestId,
            seasonId: matchSeasonId,
            title: matchTitle,
            matchDate,
            games: matchGames.map((game) => ({
              gameNumber: game.gameNumber,
              winnerTeam: game.winnerTeam,
              participants: game.participants.map((participant) => ({
                enabled: true,
                selectedPlayerId: participant.selectedPlayerId,
                selectedChampionId: participant.selectedChampionId,
                team: participant.team,
                position: participant.position,
                kills: participant.kills,
                deaths: participant.deaths,
                assists: participant.assists,
              })),
            })),
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "내전 등록 실패");
      }

      setMatchCreateResult(data);
      setMessage(`내전 등록 완료: #${data.matchId} ${data.title}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "내전 등록 중 오류가 발생했습니다.",
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="admin-page operation-ai-page" onPaste={handleImagePaste}>
      <section className="admin-hero operation-ai-hero">
        <div>
          <p className="admin-eyebrow">OPERATION AI</p>
          <h1>운영 AI 보조</h1>
          <p>
            참가 신청글, 참가 신청 캡쳐, 내전 결과 캡쳐를 분석해 운영자가 확인
            가능한 초안으로 변환합니다.
          </p>
        </div>
        <div className="operation-ai-hero__meta">
          <span>
            {isMatchMode
              ? mode === "MATCH_RESULT_TEXT"
                ? "내전 결과 붙여넣기"
                : "내전 결과 이미지"
              : "참가 신청 자동 인식"}
          </span>
          <strong>
            {isMatchMode ? `${matchGames.length}세트` : `${selectedCount}명`}
          </strong>
          <small>
            {isMatchMode
              ? `등록 준비 ${matchReadyCount}/${matchParticipantCount}`
              : `매칭 가능 ${matchedCount}명`}
          </small>
        </div>
      </section>

      <section className="admin-card operation-ai-card">
        <form onSubmit={handleAnalyze} className="operation-ai-form">
          <div
            className="operation-ai-mode-tabs"
            role="tablist"
            aria-label="분석 방식"
          >
            <button
              type="button"
              className={mode === "PARTICIPATION_TEXT" ? "is-active" : ""}
              onClick={() => {
                setMode("PARTICIPATION_TEXT");
                resetAllResults();
              }}
            >
              참가 신청글 붙여넣기
            </button>
            <button
              type="button"
              className={mode === "PARTICIPATION_IMAGE" ? "is-active" : ""}
              onClick={() => {
                setMode("PARTICIPATION_IMAGE");
                setImagePrompt(
                  "참가 신청 캡쳐를 읽어서 참가자 목록을 인식해줘.",
                );
                resetAllResults();
              }}
            >
              참가 신청 캡쳐
            </button>
            <button
              type="button"
              className={mode === "MATCH_RESULT_IMAGE" ? "is-active" : ""}
              onClick={() => {
                setMode("MATCH_RESULT_IMAGE");
                resetAllResults();
              }}
            >
              내전 결과 캡쳐
            </button>
            <button
              type="button"
              className={mode === "MATCH_RESULT_TEXT" ? "is-active" : ""}
              onClick={() => {
                setMode("MATCH_RESULT_TEXT");
                resetAllResults();
              }}
            >
              ChatGPT 결과 붙여넣기
            </button>
          </div>

          {mode === "PARTICIPATION_TEXT" ? (
            <div className="admin-form-grid admin-form-grid--single">
              <label className="admin-field">
                <span>참가 신청 원문</span>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={14}
                  placeholder="카카오 참가 신청글을 그대로 붙여넣으세요."
                />
              </label>
            </div>
          ) : mode === "MATCH_RESULT_TEXT" ? (
            <div className="admin-form-grid admin-form-grid--single operation-ai-noapi-grid">
              <div className="operation-ai-noapi-guide">
                <strong>추가 API 결제 없이 사용하는 방식</strong>
                <p>
                  ChatGPT에 내전 결과 이미지를 올려 JSON으로 추출한 뒤, 이 칸에
                  붙여넣으면 사이트가 DB 매칭과 내전 등록 초안을 생성합니다.
                </p>
                <details>
                  <summary>ChatGPT에 보낼 요청 문구 보기</summary>
                  <pre>{`이 롤 내전 결과 이미지를 보고 아래 JSON 형식으로만 추출해줘. 확실하지 않은 값은 null로 넣어줘.
{
  "titleHint": null,
  "matchDateHint": null,
  "games": [
    {
      "gameNumber": 1,
      "winnerTeam": "BLUE 또는 RED 또는 null",
      "participants": [
        {
          "team": "BLUE",
          "position": "TOP",
          "name": "",
          "champion": "",
          "kills": 0,
          "deaths": 0,
          "assists": 0
        }
      ]
    }
  ],
  "warnings": []
}`}</pre>
                </details>
              </div>
              <label className="admin-field">
                <span>ChatGPT 분석 결과 또는 빠른 입력</span>
                <textarea
                  value={matchText}
                  onChange={(event) => setMatchText(event.target.value)}
                  rows={18}
                  placeholder="ChatGPT가 추출한 JSON 또는 BLUE TOP 재현 아리 7/2/10 형식으로 붙여넣으세요."
                />
              </label>
            </div>
          ) : (
            <div className="operation-ai-image-grid">
              <label className="admin-field">
                <span>요청 내용</span>
                <input
                  value={
                    mode === "MATCH_RESULT_IMAGE" ? matchPrompt : imagePrompt
                  }
                  onChange={(event) =>
                    mode === "MATCH_RESULT_IMAGE"
                      ? setMatchPrompt(event.target.value)
                      : setImagePrompt(event.target.value)
                  }
                  placeholder="예: 이 캡쳐 기준으로 자동 인식해줘."
                />
              </label>

              <div
                className={`admin-field operation-ai-upload-field operation-ai-paste-zone ${imageFile ? "has-image" : ""}`}
                tabIndex={0}
                role="button"
                aria-label="스크린샷 붙여넣기 또는 이미지 파일 선택"
                onPaste={handleImagePaste}
              >
                <span>
                  {mode === "MATCH_RESULT_IMAGE"
                    ? "내전 결과 캡쳐 이미지"
                    : "참가 신청 캡쳐 이미지"}
                </span>
                <div className="operation-ai-paste-box">
                  <strong>Ctrl + V로 스크린샷 붙여넣기</strong>
                  <p>
                    캡쳐 후 이 영역을 한 번 클릭하고 붙여넣으면 이미지가 바로
                    들어갑니다.
                  </p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageChange}
                  />
                  <small>
                    파일 선택도 가능 · PNG, JPG, WEBP / 최대 8MB ·
                    OPENAI_API_KEY 필요
                  </small>
                </div>
              </div>

              {imagePreviewUrl ? (
                <div className="operation-ai-image-preview">
                  <div className="operation-ai-image-preview__bar">
                    <span>{imageSourceLabel || "선택된 이미지"}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedImageFile(null)}
                    >
                      제거
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreviewUrl} alt="업로드한 캡쳐 미리보기" />
                </div>
              ) : (
                <div className="operation-ai-image-placeholder">
                  <strong>이미지 대기 중</strong>
                  <span>
                    캡쳐 이미지를 Ctrl+V로 붙여넣거나 파일을 선택하세요.
                  </span>
                </div>
              )}
            </div>
          )}

          {isMatchMode ? (
            <div className="operation-ai-toolbar operation-ai-match-toolbar">
              <label className="admin-field operation-ai-title-field">
                <span>내전명</span>
                <input
                  value={matchTitle}
                  onChange={(event) => setMatchTitle(event.target.value)}
                />
              </label>
              <label className="admin-field operation-ai-date-field">
                <span>내전 일시</span>
                <input
                  type="datetime-local"
                  value={matchDate}
                  onChange={(event) => setMatchDate(event.target.value)}
                />
              </label>
              <label className="admin-field operation-ai-date-field">
                <span>시즌 ID</span>
                <input
                  type="number"
                  min="1"
                  value={matchSeasonId ?? ""}
                  onChange={(event) =>
                    setMatchSeasonId(toNullableNumber(event.target.value))
                  }
                  placeholder="활성 시즌 자동 입력"
                />
              </label>
              <button
                type="submit"
                className="admin-primary-button"
                disabled={loading}
              >
                {loading
                  ? "분석 중..."
                  : mode === "MATCH_RESULT_TEXT"
                    ? "내전 결과 텍스트 분석"
                    : "내전 결과 이미지 분석"}
              </button>
            </div>
          ) : (
            <div className="operation-ai-toolbar">
              <label className="admin-field operation-ai-date-field">
                <span>참가 신청 날짜</span>
                <input
                  type="date"
                  value={applyDate}
                  onChange={(event) => setApplyDate(event.target.value)}
                />
              </label>

              <label className="operation-ai-check">
                <input
                  type="checkbox"
                  checked={createMissingPlayers}
                  onChange={(event) =>
                    setCreateMissingPlayers(event.target.checked)
                  }
                />
                <span>DB에 없는 이름은 임시 플레이어로 생성</span>
              </label>

              <button
                type="submit"
                className="admin-primary-button"
                disabled={loading}
              >
                {loading
                  ? "분석 중..."
                  : mode === "PARTICIPATION_TEXT"
                    ? "참가 신청 분석"
                    : "캡쳐 이미지 분석"}
              </button>
            </div>
          )}
        </form>

        {message ? <div className="operation-ai-message">{message}</div> : null}
      </section>

      {extractedText ? (
        <section className="admin-card operation-ai-card">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">IMAGE OCR</p>
              <h2>이미지 인식 원문</h2>
            </div>
          </div>
          <pre className="operation-ai-extracted-text">{extractedText}</pre>
          <p className="operation-ai-note">
            이미지 인식값은 오인식 가능성이 있으므로 아래 표에서 반드시 확인 후
            등록하세요.
          </p>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="admin-card operation-ai-card">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">PARSED RESULT</p>
              <h2>참가 신청 인식 결과</h2>
            </div>
            <button
              type="button"
              className="admin-primary-button"
              onClick={handleConfirmParticipation}
              disabled={confirming}
            >
              {confirming ? "등록 중..." : "시즌 참가 신청 등록"}
            </button>
          </div>

          <div className="operation-ai-table-wrap">
            <table className="admin-table operation-ai-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>이름</th>
                  <th>티어</th>
                  <th>라인</th>
                  <th>DB 매칭</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowId}>
                    <td>{row.order}</td>
                    <td>
                      <input
                        className="operation-ai-inline-input"
                        value={row.name}
                        onChange={(event) =>
                          updateRow(row.rowId, { name: event.target.value })
                        }
                      />
                      <small>{row.rawLine}</small>
                    </td>
                    <td>
                      <div className="operation-ai-tier-pair">
                        <span>현 {row.currentTier || "-"}</span>
                        <span>최 {row.peakTier || "-"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="operation-ai-line-pair">
                        <strong>{row.mainPosition || "-"}</strong>
                        <span>
                          {row.subPositions.length > 0
                            ? row.subPositions.join(", ")
                            : "부라인 없음"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <select
                        value={row.selectedPlayerId ?? ""}
                        onChange={(event) => {
                          const value = Number(event.target.value || 0);
                          updateRow(row.rowId, {
                            selectedPlayerId: value > 0 ? value : null,
                          });
                        }}
                      >
                        <option value="">매칭 선택</option>
                        {row.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name} / {candidate.nickname}#
                            {candidate.tag} · {candidate.score}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span
                        className={`operation-ai-status ${row.warnings.length > 0 ? "is-warning" : "is-ok"}`}
                      >
                        {getStatusLabel(row)}
                      </span>
                      {row.warnings.length > 0 ? (
                        <ul className="operation-ai-warnings">
                          {row.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {matchGames.length > 0 ? (
        <section className="admin-card operation-ai-card">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">MATCH RESULT DRAFT</p>
              <h2>내전 결과 인식 초안</h2>
            </div>
            <button
              type="button"
              className="admin-primary-button"
              onClick={handleConfirmMatchResult}
              disabled={confirming}
            >
              {confirming
                ? "등록 중..."
                : `내전 등록 (${matchReadyCount}/${matchParticipantCount})`}
            </button>
          </div>

          {matchResult?.warnings?.length ? (
            <ul className="operation-ai-global-warnings">
              {matchResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="operation-ai-match-result-list">
            {matchGames.map((game) => (
              <div className="operation-ai-game-card" key={game.gameNumber}>
                <div className="operation-ai-game-card__head">
                  <h3>{game.gameNumber}세트</h3>
                  <label>
                    승리팀
                    <select
                      value={game.winnerTeam ?? ""}
                      onChange={(event) =>
                        updateMatchGame(game.gameNumber, {
                          winnerTeam:
                            event.target.value === "BLUE" ||
                            event.target.value === "RED"
                              ? event.target.value
                              : null,
                        })
                      }
                    >
                      <option value="">선택</option>
                      {teamOptions.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {game.warnings?.length ? (
                  <ul className="operation-ai-warnings operation-ai-game-warnings">
                    {game.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="operation-ai-table-wrap">
                  <table className="admin-table operation-ai-table operation-ai-result-table">
                    <thead>
                      <tr>
                        <th>팀</th>
                        <th>라인</th>
                        <th>선수</th>
                        <th>챔피언</th>
                        <th>K/D/A</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {game.participants.map((participant) => (
                        <tr key={participant.rowId}>
                          <td>
                            <select
                              value={participant.team ?? ""}
                              onChange={(event) =>
                                updateMatchParticipant(
                                  game.gameNumber,
                                  participant.rowId,
                                  {
                                    team:
                                      event.target.value === "BLUE" ||
                                      event.target.value === "RED"
                                        ? event.target.value
                                        : null,
                                  },
                                )
                              }
                            >
                              <option value="">-</option>
                              {teamOptions.map((team) => (
                                <option key={team} value={team}>
                                  {team}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={participant.position ?? ""}
                              onChange={(event) =>
                                updateMatchParticipant(
                                  game.gameNumber,
                                  participant.rowId,
                                  {
                                    position: positionOptions.includes(
                                      event.target
                                        .value as (typeof positionOptions)[number],
                                    )
                                      ? (event.target
                                          .value as MatchResultParticipant["position"])
                                      : null,
                                  },
                                )
                              }
                            >
                              <option value="">-</option>
                              {positionOptions.map((position) => (
                                <option key={position} value={position}>
                                  {position}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={participant.selectedPlayerId ?? ""}
                              onChange={(event) => {
                                const value = Number(event.target.value || 0);
                                updateMatchParticipant(
                                  game.gameNumber,
                                  participant.rowId,
                                  {
                                    selectedPlayerId: value > 0 ? value : null,
                                  },
                                );
                              }}
                            >
                              <option value="">
                                {participant.name || "선수 선택"}
                              </option>
                              {participant.playerCandidates.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.name} / {candidate.nickname}#
                                  {candidate.tag} · {candidate.score}
                                </option>
                              ))}
                            </select>
                            <small>
                              {participant.rawText || participant.name}
                            </small>
                          </td>
                          <td>
                            <select
                              value={participant.selectedChampionId ?? ""}
                              onChange={(event) => {
                                const value = Number(event.target.value || 0);
                                updateMatchParticipant(
                                  game.gameNumber,
                                  participant.rowId,
                                  {
                                    selectedChampionId:
                                      value > 0 ? value : null,
                                  },
                                );
                              }}
                            >
                              <option value="">
                                {participant.champion || "챔피언 선택"}
                              </option>
                              {participant.championCandidates.map(
                                (candidate) => (
                                  <option
                                    key={candidate.id}
                                    value={candidate.id}
                                  >
                                    {candidate.name} · {candidate.score}
                                  </option>
                                ),
                              )}
                            </select>
                          </td>
                          <td>
                            <div className="operation-ai-kda-inputs">
                              <input
                                type="number"
                                min="0"
                                value={participant.kills ?? ""}
                                onChange={(event) =>
                                  updateMatchParticipant(
                                    game.gameNumber,
                                    participant.rowId,
                                    {
                                      kills: toNullableNumber(
                                        event.target.value,
                                      ),
                                    },
                                  )
                                }
                                aria-label="킬"
                              />
                              <input
                                type="number"
                                min="0"
                                value={participant.deaths ?? ""}
                                onChange={(event) =>
                                  updateMatchParticipant(
                                    game.gameNumber,
                                    participant.rowId,
                                    {
                                      deaths: toNullableNumber(
                                        event.target.value,
                                      ),
                                    },
                                  )
                                }
                                aria-label="데스"
                              />
                              <input
                                type="number"
                                min="0"
                                value={participant.assists ?? ""}
                                onChange={(event) =>
                                  updateMatchParticipant(
                                    game.gameNumber,
                                    participant.rowId,
                                    {
                                      assists: toNullableNumber(
                                        event.target.value,
                                      ),
                                    },
                                  )
                                }
                                aria-label="어시스트"
                              />
                            </div>
                          </td>
                          <td>
                            <span
                              className={`operation-ai-status ${participant.warnings.length > 0 ? "is-warning" : "is-ok"}`}
                            >
                              {getResultRowStatus(participant)}
                            </span>
                            {participant.warnings.length > 0 ? (
                              <ul className="operation-ai-warnings">
                                {participant.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {confirmResult ? (
        <section className="admin-card operation-ai-card">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">CONFIRM RESULT</p>
              <h2>등록 결과</h2>
            </div>
          </div>
          <div className="operation-ai-result-grid">
            <div>
              <strong>등록 완료</strong>
              <p>{confirmResult.confirmedCount}명</p>
              <ul>
                {confirmResult.confirmed.map((item) => (
                  <li key={`${item.playerId}-${item.name}`}>
                    #{item.playerId} {item.name}
                    {item.createdPlayer ? " · 임시 생성" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <strong>보류</strong>
              <p>{confirmResult.skippedCount}명</p>
              <ul>
                {confirmResult.skipped.map((item) => (
                  <li key={`${item.name}-${item.reason}`}>
                    {item.name} · {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {matchCreateResult ? (
        <section className="admin-card operation-ai-card">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">MATCH CREATED</p>
              <h2>내전 등록 완료</h2>
            </div>
          </div>
          <div className="operation-ai-created-match">
            <strong>#{matchCreateResult.matchId}</strong>
            <span>{matchCreateResult.title}</span>
            <small>{matchCreateResult.gameCount}개 세트 등록</small>
          </div>
        </section>
      ) : null}
    </main>
  );
}
