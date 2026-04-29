import type { OpenAiUsage } from "../usage.js";

export function createChatCompletionResponse(
  model: string,
  content: string,
  usage?: OpenAiUsage,
) {
  const response: {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
      index: number;
      message: { role: string; content: string };
      finish_reason: string;
    }>;
    usage?: OpenAiUsage;
  } = {
    id: `cursor-acp-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: `cursor-acp/${model}`,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      }
    ],
  };

  if (usage) {
    response.usage = usage;
  }

  return response;
}

export function createChatCompletionChunk(
  id: string,
  created: number,
  model: string,
  deltaContent: string,
  done = false,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model: `cursor-acp/${model}`,
    choices: [
      {
        index: 0,
        delta: deltaContent ? { content: deltaContent } : {},
        finish_reason: done ? "stop" : null,
      }
    ],
  };
}
