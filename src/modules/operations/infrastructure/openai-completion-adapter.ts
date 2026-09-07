import type { AiCompletionPort, AiCompletionResult } from "../application/ports";
import { OperationsError } from "./postgres-operations-repository";

type Fetch = typeof fetch;

export type OpenAiCompletionConfiguration = Readonly<{
  apiKey: string;
  model: string;
  inputMicrosPerMillionTokens: number;
  outputMicrosPerMillionTokens: number;
  maximumOutputTokens: number;
  timeoutMilliseconds: number;
  fetch?: Fetch;
}>;

const endpoint = "https://api.openai.com/v1/responses";
const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function integer(value: string | undefined, minimum: number, maximum: number): number | null {
  if (!value || !/^(?:0|[1-9][0-9]{0,15})$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function readOpenAiCompletionConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OpenAiCompletionConfiguration | null {
  if (environment.V2_OPENAI_COMPLETION_ENABLED !== "true") return null;
  const apiKey = environment.OPENAI_API_KEY?.trim() ?? "";
  const model = environment.OPENAI_MODEL?.trim() ?? "";
  const inputRate = integer(environment.OPENAI_INPUT_MICROS_PER_MILLION_TOKENS, 0, 1_000_000_000);
  const outputRate = integer(environment.OPENAI_OUTPUT_MICROS_PER_MILLION_TOKENS, 0, 1_000_000_000);
  const maximumOutputTokens = integer(environment.OPENAI_MAX_OUTPUT_TOKENS ?? "500", 64, 2_000);
  const timeoutMilliseconds = integer(environment.OPENAI_REQUEST_TIMEOUT_MS ?? "15000", 1_000, 30_000);
  if (
    apiKey.length < 32 || apiKey.length > 512 || /[\s\u0000-\u001f\u007f]/u.test(apiKey) ||
    !modelPattern.test(model) || inputRate === null || outputRate === null ||
    maximumOutputTokens === null || timeoutMilliseconds === null
  ) return null;
  return {
    apiKey,
    model,
    inputMicrosPerMillionTokens: inputRate,
    outputMicrosPerMillionTokens: outputRate,
    maximumOutputTokens,
    timeoutMilliseconds,
  };
}

function boundedJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > 256 * 1_024) throw new OperationsError("AI_ADAPTER_RESPONSE_INVALID");
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { throw new OperationsError("AI_ADAPTER_RESPONSE_INVALID"); }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textFromResponse(value: unknown): string | null {
  const body = object(value);
  if (!body || !Array.isArray(body.output)) return null;
  const fragments: string[] = [];
  for (const item of body.output) {
    const message = object(item);
    if (!message || message.type !== "message" || !Array.isArray(message.content)) continue;
    for (const content of message.content) {
      const output = object(content);
      if (output?.type === "output_text" && typeof output.text === "string") fragments.push(output.text);
    }
  }
  const combined = fragments.join("\n").trim();
  return combined && combined.length <= 20_000 ? combined : null;
}

function usageFromResponse(value: unknown): Readonly<{ inputTokens: number; outputTokens: number }> | null {
  const usage = object(object(value)?.usage);
  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;
  return Number.isSafeInteger(inputTokens) && Number(inputTokens) >= 0 &&
    Number.isSafeInteger(outputTokens) && Number(outputTokens) >= 0
    ? { inputTokens: Number(inputTokens), outputTokens: Number(outputTokens) }
    : null;
}

function estimatedCost(configuration: OpenAiCompletionConfiguration, inputTokens: number, outputTokens: number) {
  return Math.ceil(
    (inputTokens * configuration.inputMicrosPerMillionTokens +
      outputTokens * configuration.outputMicrosPerMillionTokens) / 1_000_000,
  );
}

export class OpenAiResponsesCompletionAdapter implements AiCompletionPort {
  readonly key: string;
  private readonly request: Fetch;

  constructor(private readonly configuration: OpenAiCompletionConfiguration) {
    this.key = `openai-responses:${configuration.model}`;
    this.request = configuration.fetch ?? fetch;
  }

  async complete(input: Readonly<{ prompt: string; maximumCostMicros: number }>): Promise<AiCompletionResult> {
    const estimatedInputTokens = Math.ceil(Buffer.byteLength(input.prompt, "utf8") / 3);
    if (
      !Number.isSafeInteger(input.maximumCostMicros) || input.maximumCostMicros < 0 ||
      estimatedCost(this.configuration, estimatedInputTokens, this.configuration.maximumOutputTokens) > input.maximumCostMicros
    ) throw new OperationsError("AI_COST_LIMITED");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMilliseconds);
    try {
      const response = await this.request(endpoint, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.configuration.model,
          instructions: "K-LOL.GG 사용법과 내전 운영 질문에 한국어로 간결하고 친절하게 답하세요. 제공되지 않은 개인 정보나 운영 상태를 추측하지 마세요.",
          input: input.prompt,
          max_output_tokens: this.configuration.maximumOutputTokens,
          store: false,
        }),
      });
      if (response.status === 401 || response.status === 403) throw new OperationsError("AI_ADAPTER_AUTH_FAILED");
      if (response.status === 429) throw new OperationsError("AI_ADAPTER_RATE_LIMITED");
      if (!response.ok) throw new OperationsError("AI_ADAPTER_UPSTREAM_UNAVAILABLE");
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > 256 * 1_024) {
        throw new OperationsError("AI_ADAPTER_RESPONSE_INVALID");
      }
      const parsed = boundedJson(new Uint8Array(await response.arrayBuffer()));
      const text = textFromResponse(parsed);
      const usage = usageFromResponse(parsed);
      if (!text || !usage) throw new OperationsError("AI_ADAPTER_RESPONSE_INVALID");
      const cost = estimatedCost(this.configuration, usage.inputTokens, usage.outputTokens);
      if (cost > input.maximumCostMicros) throw new OperationsError("AI_ADAPTER_COST_INVALID");
      return { text, ...usage, estimatedCostMicros: cost };
    } catch (error) {
      if (error instanceof OperationsError) throw error;
      throw new OperationsError("AI_ADAPTER_NETWORK_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}
