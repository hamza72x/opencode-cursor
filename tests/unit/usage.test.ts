import {
  createChatCompletionUsageChunk,
  createOpenAiUsage,
  extractOpenAiUsageFromResult,
  normalizeCursorUsage,
} from "../../src/usage.js";

describe("usage metrics", () => {
  it("maps Cursor stream usage to OpenAI usage", () => {
    const usage = extractOpenAiUsageFromResult({
      type: "result",
      subtype: "success",
      usage: {
        inputTokens: 1397,
        outputTokens: 8,
        cacheReadTokens: 9856,
        cacheWriteTokens: 2,
      },
    });

    expect(usage).toEqual({
      prompt_tokens: 11255,
      completion_tokens: 8,
      total_tokens: 11263,
      prompt_tokens_details: {
        cached_tokens: 9856,
        cache_write_tokens: 2,
      },
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    });
  });

  it("supports reasoning tokens and cost aliases", () => {
    const metrics = normalizeCursorUsage({
      input_tokens: 100,
      output_tokens: 25,
      reasoning_tokens: 5,
      cache_read_tokens: 50,
      cache_write_tokens: 10,
      total_cost: 0.0012,
    });

    expect(metrics).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      reasoningTokens: 5,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
      cost: 0.0012,
    });
    expect(createOpenAiUsage(metrics!)).toEqual({
      prompt_tokens: 160,
      completion_tokens: 25,
      total_tokens: 190,
      prompt_tokens_details: {
        cached_tokens: 50,
        cache_write_tokens: 10,
      },
      completion_tokens_details: {
        reasoning_tokens: 5,
      },
      cost: 0.0012,
    });
  });

  it("ignores empty or invalid usage", () => {
    expect(normalizeCursorUsage(undefined)).toBeUndefined();
    expect(normalizeCursorUsage({})).toBeUndefined();
    expect(normalizeCursorUsage({ inputTokens: -1, outputTokens: Number.NaN })).toBeUndefined();
  });

  it("creates OpenAI streaming usage chunks", () => {
    const chunk = createChatCompletionUsageChunk("chatcmpl-test", 123, "auto", {
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
      prompt_tokens_details: {
        cached_tokens: 4,
        cache_write_tokens: 0,
      },
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    });

    expect(chunk).toEqual({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 123,
      model: "auto",
      choices: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
        prompt_tokens_details: {
          cached_tokens: 4,
          cache_write_tokens: 0,
        },
        completion_tokens_details: {
          reasoning_tokens: 0,
        },
      },
    });
  });
});
