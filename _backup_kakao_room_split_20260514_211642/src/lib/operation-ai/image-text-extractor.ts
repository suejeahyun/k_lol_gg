export type ImageTextExtractionResult = {
  extractedText: string;
  notes: string[];
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

export async function extractParticipationTextFromImage(params: {
  base64: string;
  mimeType: string;
  prompt?: string | null;
}): Promise<ImageTextExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
  const dataUrl = `data:${params.mimeType};base64,${params.base64}`;

  const instruction = [
    "너는 K-LOL.GG 운영자를 돕는 참가 신청 캡쳐 판독기다.",
    "이미지에 있는 참가 신청 목록을 최대한 원문에 가깝게 텍스트로 전사하라.",
    "반드시 번호.이름/현티어/최고티어/주라인 부라인 형태가 보이면 그 줄을 보존하라.",
    "예: 1.재현/M/M/AD MID",
    "카카오톡 공지, 이모지, 설명문은 필요하면 포함해도 되지만 참가자 줄을 가장 정확히 유지하라.",
    "확실하지 않은 글자는 [?]로 표시하라.",
    "추가 설명은 최소화하고, 전사 텍스트만 출력하라.",
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

  const extractedText = getOpenAiText(data);

  if (!extractedText) {
    throw new Error("이미지에서 텍스트를 추출하지 못했습니다.");
  }

  return {
    extractedText,
    notes: [
      "이미지 분석 결과는 오인식 가능성이 있으므로 등록 전 확인이 필요합니다.",
      "[?] 표시는 AI가 확신하지 못한 문자입니다.",
    ],
  };
}
