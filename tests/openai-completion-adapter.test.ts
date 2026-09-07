import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAiResponsesCompletionAdapter,
  readOpenAiCompletionConfiguration,
} from "../src/modules/operations/infrastructure/openai-completion-adapter";

function environment(overrides: Readonly<Record<string, string | undefined>> = {}): Record<string, string | undefined> {
  return {
    V2_OPENAI_COMPLETION_ENABLED: "true",
    OPENAI_API_KEY: "test-key-that-is-never-sent-to-a-real-service-123456",
    OPENAI_MODEL: "configured-model",
    OPENAI_INPUT_MICROS_PER_MILLION_TOKENS: "1000000",
    OPENAI_OUTPUT_MICROS_PER_MILLION_TOKENS: "2000000",
    OPENAI_MAX_OUTPUT_TOKENS: "128",
    OPENAI_REQUEST_TIMEOUT_MS: "5000",
    ...overrides,
  };
}

test("OpenAI runtime configuration is explicit, bounded and all-or-nothing", () => {
  assert.equal(readOpenAiCompletionConfiguration(environment({ V2_OPENAI_COMPLETION_ENABLED: "false" })), null);
  assert.equal(readOpenAiCompletionConfiguration(environment({ OPENAI_API_KEY: "" })), null);
  assert.equal(readOpenAiCompletionConfiguration(environment({ OPENAI_MODEL: "bad model" })), null);
  assert.equal(readOpenAiCompletionConfiguration(environment({ OPENAI_MAX_OUTPUT_TOKENS: "2001" })), null);
  const parsed = readOpenAiCompletionConfiguration(environment());
  assert.ok(parsed);
  assert.equal(parsed.model, "configured-model");
  assert.equal(parsed.maximumOutputTokens, 128);
});

test("Responses adapter uses the fixed official endpoint and aggregates output text safely", async () => {
  const configuration = readOpenAiCompletionConfiguration(environment());
  assert.ok(configuration);
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const adapter = new OpenAiResponsesCompletionAdapter({
    ...configuration,
    fetch: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        output: [
          { type: "reasoning", content: [] },
          { type: "message", content: [{ type: "output_text", text: "첫 문장" }, { type: "output_text", text: "둘째 문장" }] },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const result = await adapter.complete({ prompt: "사이트 사용법", maximumCostMicros: 1_000 });
  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.redirect, "error");
  assert.equal(result.text, "첫 문장\n둘째 문장");
  assert.deepEqual({ input: result.inputTokens, output: result.outputTokens, cost: result.estimatedCostMicros }, { input: 10, output: 20, cost: 50 });
  const sent = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.equal(sent.model, "configured-model");
  assert.equal(sent.store, false);
  assert.equal(sent.input, "사이트 사용법");
  assert.equal(JSON.stringify(sent).includes(configuration.apiKey), false);
});

test("Responses adapter fails closed for budget, authorization, rate limit and malformed output", async () => {
  const configuration = readOpenAiCompletionConfiguration(environment());
  assert.ok(configuration);
  const withStatus = (status: number, body = {}) => new OpenAiResponsesCompletionAdapter({
    ...configuration,
    fetch: async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(withStatus(200).complete({ prompt: "질문", maximumCostMicros: 1 }), /AI_COST_LIMITED/u);
  await assert.rejects(withStatus(401).complete({ prompt: "질문", maximumCostMicros: 1_000 }), /AI_ADAPTER_AUTH_FAILED/u);
  await assert.rejects(withStatus(429).complete({ prompt: "질문", maximumCostMicros: 1_000 }), /AI_ADAPTER_RATE_LIMITED/u);
  await assert.rejects(withStatus(200, { output: [], usage: { input_tokens: 1, output_tokens: 1 } }).complete({ prompt: "질문", maximumCostMicros: 1_000 }), /AI_ADAPTER_RESPONSE_INVALID/u);
});
