export type AiMatchResultParticipant = {
  name: string;
  champion: string | null;
  team: "BLUE" | "RED" | null;
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  rawText?: string | null;
  confidence?: number | null;
};

export type AiMatchResultGame = {
  gameNumber: number;
  winnerTeam: "BLUE" | "RED" | null;
  participants: AiMatchResultParticipant[];
  warnings?: string[];
};

export type AiMatchResultExtraction = {
  titleHint: string | null;
  matchDateHint: string | null;
  games: AiMatchResultGame[];
  warnings: string[];
  rawText?: string | null;
};

type OpenAiOutputContent = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  content?: OpenAiOutputContent[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: OpenAiOutputItem[];
  error?: {
    message?: string;
  };
};

function getOpenAiText(data: OpenAiResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeTeam(value: unknown): "BLUE" | "RED" | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (["BLUE", "B", "블루"].includes(text)) return "BLUE";
  if (["RED", "R", "레드"].includes(text)) return "RED";
  return null;
}

function normalizePosition(value: unknown): "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (["TOP", "탑"].includes(text)) return "TOP";
  if (["JG", "JGL", "JUNGLE", "정글"].includes(text)) return "JGL";
  if (["MID", "MD", "미드"].includes(text)) return "MID";
  if (["AD", "ADC", "원딜"].includes(text)) return "ADC";
  if (["SUP", "SP", "SUPPORT", "서폿", "서포터"].includes(text)) return "SUP";
  return null;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.floor(number));
}

function normalizeExtraction(value: unknown): AiMatchResultExtraction {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const gamesSource = Array.isArray(source.games) ? source.games : [];
  const warnings = Array.isArray(source.warnings)
    ? source.warnings.map((item) => String(item)).filter(Boolean)
    : [];

  const games: AiMatchResultGame[] = gamesSource.map((gameSource, gameIndex) => {
    const game = gameSource && typeof gameSource === "object" ? (gameSource as Record<string, unknown>) : {};
    const participantsSource = Array.isArray(game.participants) ? game.participants : [];

    return {
      gameNumber: toNullableNumber(game.gameNumber) ?? gameIndex + 1,
      winnerTeam: normalizeTeam(game.winnerTeam),
      warnings: Array.isArray(game.warnings)
        ? game.warnings.map((item) => String(item)).filter(Boolean)
        : [],
      participants: participantsSource.map((participantSource) => {
        const participant = participantSource && typeof participantSource === "object"
          ? (participantSource as Record<string, unknown>)
          : {};

        return {
          name: String(participant.name ?? "").trim(),
          champion: participant.champion === null || participant.champion === undefined
            ? null
            : String(participant.champion).trim() || null,
          team: normalizeTeam(participant.team),
          position: normalizePosition(participant.position),
          kills: toNullableNumber(participant.kills),
          deaths: toNullableNumber(participant.deaths),
          assists: toNullableNumber(participant.assists),
          rawText: participant.rawText === null || participant.rawText === undefined
            ? null
            : String(participant.rawText),
          confidence: toNullableNumber(participant.confidence),
        };
      }),
    };
  });

  return {
    titleHint: source.titleHint === null || source.titleHint === undefined ? null : String(source.titleHint),
    matchDateHint: source.matchDateHint === null || source.matchDateHint === undefined ? null : String(source.matchDateHint),
    rawText: source.rawText === null || source.rawText === undefined ? null : String(source.rawText),
    warnings,
    games,
  };
}

export async function extractMatchResultFromImage(params: {
  base64: string;
  mimeType: string;
  prompt?: string | null;
}): Promise<AiMatchResultExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
  const dataUrl = `data:${params.mimeType};base64,${params.base64}`;

  const instruction = [
    "너는 K-LOL.GG 관리자용 내전 결과 캡쳐 판독기다.",
    "이미지에서 세트별 BLUE/RED 팀, 승리팀, 선수명, 챔피언명, 라인, K/D/A를 추출한다.",
    "반드시 JSON만 출력한다. 마크다운, 설명문, 코드블록을 쓰지 않는다.",
    "정확하지 않은 값은 null로 둔다. 추측이 필요한 부분은 warnings에 적는다.",
    "포지션은 TOP, JGL, MID, ADC, SUP 중 하나만 사용한다.",
    "팀은 BLUE 또는 RED만 사용한다.",
    "K/D/A 숫자를 읽을 수 없으면 kills/deaths/assists를 null로 둔다.",
    "출력 형식:",
    JSON.stringify({
      titleHint: "5월 10일 1차 내전 또는 null",
      matchDateHint: "2026-05-10 또는 null",
      rawText: "이미지에서 읽은 주요 원문",
      warnings: ["전체 경고"],
      games: [
        {
          gameNumber: 1,
          winnerTeam: "BLUE",
          warnings: ["세트 경고"],
          participants: [
            {
              name: "재현",
              champion: "카이사",
              team: "BLUE",
              position: "ADC",
              kills: 7,
              deaths: 2,
              assists: 9,
              rawText: "원문 줄",
              confidence: 90,
            },
          ],
        },
      ],
    }),
    params.prompt ? `관리자 요청: ${params.prompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instruction },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
      temperature: 0,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OpenAiResponse;

  if (!response.ok) {
    const message = data.error?.message || `OpenAI 이미지 분석 실패 (${response.status})`;
    throw new Error(message);
  }

  const text = getOpenAiText(data);
  if (!text) {
    throw new Error("이미지에서 내전 결과를 추출하지 못했습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    throw new Error("AI가 JSON 형식으로 결과를 반환하지 않았습니다. 다시 분석하거나 프롬프트를 더 구체적으로 입력해주세요.");
  }

  const extraction = normalizeExtraction(parsed);

  if (extraction.games.length === 0) {
    extraction.warnings.push("세트 정보를 인식하지 못했습니다.");
  }

  for (const game of extraction.games) {
    if (!game.winnerTeam) game.warnings?.push("승리팀을 인식하지 못했습니다.");
    if (game.participants.length !== 10) {
      game.warnings?.push(`참가자가 10명이 아닙니다. 현재 ${game.participants.length}명 인식됨.`);
    }
  }

  return extraction;
}
